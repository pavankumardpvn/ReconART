"""Celery Beat periodic task that checks for due reconciliation schedules."""

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.celery_app import celery
from app.config import settings
from app.models.matching import ReconRun
from app.models.schedule import Schedule

logger = logging.getLogger(__name__)


_engine = create_async_engine(settings.database_url, pool_pre_ping=True)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)


def _get_async_session() -> AsyncSession:
    return _session_factory()


def _compute_next_run(cron_expression: str, from_dt: datetime) -> datetime | None:
    """Compute the next run time from a cron expression.

    Attempts to use croniter if installed; otherwise falls back to a simple
    parser that handles common patterns:
        - ``* * * * *``  -> every minute
        - ``*/N * * * *`` -> every N minutes
        - ``0 * * * *``  -> every hour
        - ``0 */N * * *`` -> every N hours
        - ``0 0 * * *``  -> daily at midnight
    If the expression cannot be parsed, returns None (schedule must be
    refreshed manually).
    """
    try:
        from croniter import croniter  # type: ignore[import-untyped]
        cron = croniter(cron_expression, from_dt)
        return cron.get_next(datetime)
    except ImportError:
        pass

    # ---- simple fallback parser ------------------------------------------------
    try:
        parts = cron_expression.strip().split()
        if len(parts) != 5:
            return None

        minute_part, hour_part = parts[0], parts[1]

        from datetime import timedelta

        # Every minute: * * * * *
        if minute_part == "*" and hour_part == "*":
            return from_dt + timedelta(minutes=1)

        # Every N minutes: */N * * * *
        if minute_part.startswith("*/") and hour_part == "*":
            interval = int(minute_part[2:])
            return from_dt + timedelta(minutes=interval)

        # Every hour: 0 * * * *
        if minute_part == "0" and hour_part == "*":
            return from_dt + timedelta(hours=1)

        # Every N hours: 0 */N * * *
        if minute_part == "0" and hour_part.startswith("*/"):
            interval = int(hour_part[2:])
            return from_dt + timedelta(hours=interval)

        # Daily: 0 0 * * *
        if minute_part == "0" and hour_part == "0":
            return from_dt + timedelta(days=1)

        return None
    except Exception:
        logger.warning("Could not parse cron expression: %s", cron_expression)
        return None


def _dispatch_notifications_async(schedule, run, task_result):
    """Fire-and-forget: wait for the Celery result and send notifications."""
    import threading

    def _worker():
        try:
            result = task_result.get(timeout=600)
            status = result.get("status", "unknown") if isinstance(result, dict) else "unknown"

            schedule_dict = {
                "name": schedule.name or "Scheduled Reconciliation",
                "notify_email": "",
            }
            run_dict = {
                "id": str(run.id),
                "status": status,
                "match_rate": result.get("match_rate") if isinstance(result, dict) else None,
                "matched_count": result.get("matched", 0) if isinstance(result, dict) else 0,
                "unmatched_left": result.get("unmatched_left", 0) if isinstance(result, dict) else 0,
                "unmatched_right": result.get("unmatched_right", 0) if isinstance(result, dict) else 0,
            }

            emails = schedule.notification_emails or []
            if not emails:
                return

            from app.services.email_service import (
                send_recon_complete_notification,
                send_recon_failure_notification,
            )

            for email in emails:
                schedule_dict["notify_email"] = email
                if status == "completed" and schedule.notify_on_complete:
                    send_recon_complete_notification(schedule_dict, run_dict)
                elif status != "completed" and schedule.notify_on_failure:
                    error = result.get("error", "Unknown error") if isinstance(result, dict) else "Task failed"
                    send_recon_failure_notification(schedule_dict, run_dict, error)

            logger.info("Notifications dispatched for schedule %s", schedule.id)
        except Exception:
            logger.warning("Notification dispatch failed for schedule %s", schedule.id, exc_info=True)
            if schedule.notify_on_failure and schedule.notification_emails:
                from app.services.email_service import send_recon_failure_notification
                for email in schedule.notification_emails:
                    send_recon_failure_notification(
                        {"name": schedule.name or "Scheduled Reconciliation", "notify_email": email},
                        {"id": str(run.id), "status": "failed"},
                        "Task timed out or failed unexpectedly",
                    )

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()


async def _check_and_trigger_schedules() -> int:
    """Query for due schedules and trigger their reconciliation runs.

    Returns the number of schedules triggered.
    """
    now = datetime.now(timezone.utc)
    triggered = 0

    async with _get_async_session() as session:
        result = await session.execute(
            select(Schedule).where(
                Schedule.is_active.is_(True),
                Schedule.next_run_at <= now,
            )
        )
        due_schedules = result.scalars().all()

        for schedule in due_schedules:
            try:
                # 1. Create a ReconRun for the schedule's reconciliation_id
                run = ReconRun(
                    reconciliation_id=schedule.reconciliation_id,
                    tenant_id=schedule.tenant_id,
                    status="pending",
                    triggered_by=f"schedule:{schedule.id}",
                )
                session.add(run)
                await session.flush()
                await session.refresh(run)

                # 2. Queue the run_reconciliation Celery task
                try:
                    from app.tasks.reconciliation_tasks import run_reconciliation
                    task_result = run_reconciliation.delay(
                        str(schedule.reconciliation_id), str(run.id)
                    )

                    # 2b. Dispatch notifications after the run completes
                    _dispatch_notifications_async(schedule, run, task_result)
                except Exception:
                    logger.warning(
                        "Could not enqueue reconciliation task for schedule %s "
                        "(Celery may be offline)",
                        schedule.id,
                    )

                # 3. Update schedule timestamps
                schedule.last_run_at = now
                schedule.next_run_at = _compute_next_run(
                    schedule.cron_expression, now
                )

                await session.flush()
                triggered += 1

                logger.info(
                    "Triggered scheduled run: schedule=%s recon=%s run=%s next=%s",
                    schedule.id,
                    schedule.reconciliation_id,
                    run.id,
                    schedule.next_run_at,
                )
            except Exception:
                logger.exception(
                    "Error processing schedule %s", schedule.id
                )

        await session.commit()

    return triggered


@celery.task(bind=True, name="tasks.check_schedules")
def check_schedules(self) -> dict:
    """Periodic task that checks for due schedules and triggers runs."""
    logger.info("Checking for due reconciliation schedules ...")
    loop = asyncio.new_event_loop()
    try:
        triggered = loop.run_until_complete(_check_and_trigger_schedules())
        return {"triggered": triggered}
    finally:
        loop.close()
