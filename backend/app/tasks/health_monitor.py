"""Automated health monitoring with email alerts and auto-fix.

Runs every 5 minutes via Celery Beat. Checks all connected services,
sends email alerts on failure, and attempts auto-recovery.
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.celery_app import celery
from app.config import settings

logger = logging.getLogger(__name__)

# Track consecutive failures per service
_failure_counts: dict[str, int] = {}
_last_alert_sent: dict[str, float] = {}
_ALERT_THRESHOLD = 2  # alert after 2 consecutive failures
_ALERT_COOLDOWN = 600  # don't re-alert same service within 10 min


def _send_alert(service: str, status: str, error: str, is_recovery: bool = False):
    """Send email alert for service down/recovery."""
    from app.services.email_service import send_email

    if not settings.health_check_email:
        logger.info("No health_check_email configured, skipping alert for %s", service)
        return

    now = datetime.now(timezone.utc)

    if not is_recovery:
        last = _last_alert_sent.get(service, 0)
        if now.timestamp() - last < _ALERT_COOLDOWN:
            return
        _last_alert_sent[service] = now.timestamp()

    if is_recovery:
        subject = f"✅ RECOVERED: {service} is back online — ReconART"
        color = "#10b981"
        heading = "Service Recovered"
    else:
        subject = f"🚨 DOWN: {service} is unreachable — ReconART"
        color = "#ef4444"
        heading = "Service Down"

    body = f"""
    <html>
    <body style="font-family: -apple-system, sans-serif; color: #333; max-width: 600px;">
        <div style="border-left: 4px solid {color}; padding: 16px; margin: 16px 0; background: #f9fafb; border-radius: 4px;">
            <h2 style="color: {color}; margin: 0 0 8px 0;">{heading}</h2>
            <table style="border-collapse: collapse; width: 100%;">
                <tr><td style="padding: 6px 0; font-weight: 600;">Service</td><td style="padding: 6px 0;">{service}</td></tr>
                <tr><td style="padding: 6px 0; font-weight: 600;">Status</td><td style="padding: 6px 0;">{status}</td></tr>
                <tr><td style="padding: 6px 0; font-weight: 600;">Details</td><td style="padding: 6px 0;">{error}</td></tr>
                <tr><td style="padding: 6px 0; font-weight: 600;">Time (UTC)</td><td style="padding: 6px 0;">{now.strftime('%Y-%m-%d %H:%M:%S')}</td></tr>
            </table>
        </div>
        <p style="color: #888; font-size: 12px;">ReconART Health Monitor</p>
    </body>
    </html>
    """
    for email in settings.health_check_email.split(","):
        email = email.strip()
        if email:
            send_email(email, subject, body)


def _record_failure(service: str, error: str):
    _failure_counts[service] = _failure_counts.get(service, 0) + 1
    count = _failure_counts[service]
    logger.warning("Health check FAILED: %s (consecutive: %d) — %s", service, count, error)

    if count >= _ALERT_THRESHOLD:
        _send_alert(service, f"FAILED ({count} consecutive)", error)


def _record_success(service: str):
    prev_count = _failure_counts.get(service, 0)
    _failure_counts[service] = 0

    if prev_count >= _ALERT_THRESHOLD:
        _send_alert(service, "RECOVERED", "Service is responding normally again", is_recovery=True)


async def _check_database() -> tuple[bool, str]:
    """Check Neon PostgreSQL connectivity."""
    try:
        engine = create_async_engine(settings.database_url, pool_pre_ping=True)
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            result.scalar()
        await engine.dispose()
        return True, "OK"
    except Exception as e:
        return False, str(e)


async def _check_redis() -> tuple[bool, str]:
    """Check Redis connectivity."""
    try:
        from app.services.cache_service import _get_redis
        r = _get_redis()
        r.ping()
        return True, "OK"
    except Exception as e:
        return False, str(e)


async def _check_http(url: str, timeout: int = 10) -> tuple[bool, str, float]:
    """Check an HTTP endpoint. Returns (ok, message, response_time)."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            import time
            start = time.time()
            resp = await client.get(url)
            elapsed = time.time() - start
            if resp.status_code < 500:
                return True, f"HTTP {resp.status_code}", elapsed
            return False, f"HTTP {resp.status_code}", elapsed
    except Exception as e:
        return False, str(e), 0


def _auto_fix_database():
    """Attempt to recover the database connection pool."""
    try:
        from app.database import engine
        loop = asyncio.new_event_loop()
        loop.run_until_complete(engine.dispose())
        loop.close()
        logger.info("Auto-fix: database connection pool disposed and will reconnect")
    except Exception:
        logger.warning("Auto-fix: failed to reset database pool", exc_info=True)


def _auto_fix_redis():
    """Attempt to reconnect Redis."""
    try:
        from app.services import cache_service
        cache_service._redis = None
        from app.services.cache_service import _get_redis
        _get_redis().ping()
        logger.info("Auto-fix: Redis reconnected")
    except Exception:
        logger.warning("Auto-fix: failed to reconnect Redis", exc_info=True)


async def _run_health_checks() -> dict:
    """Run all health checks and return results."""
    results = {}

    # 1. Database
    db_ok, db_msg = await _check_database()
    results["Neon Database"] = {"ok": db_ok, "message": db_msg}
    if db_ok:
        _record_success("Neon Database")
    else:
        _record_failure("Neon Database", db_msg)
        _auto_fix_database()

    # 2. Redis
    redis_ok, redis_msg = await _check_redis()
    results["Upstash Redis"] = {"ok": redis_ok, "message": redis_msg}
    if redis_ok:
        _record_success("Upstash Redis")
    else:
        _record_failure("Upstash Redis", redis_msg)
        _auto_fix_redis()

    # 3. Vercel Frontend
    fe_ok, fe_msg, fe_time = await _check_http("https://recon-art.vercel.app/")
    results["Vercel Frontend"] = {"ok": fe_ok, "message": fe_msg, "time": f"{fe_time:.2f}s"}
    if fe_ok:
        _record_success("Vercel Frontend")
    else:
        _record_failure("Vercel Frontend", fe_msg)

    # 4. Clerk Auth
    clerk_ok, clerk_msg, clerk_time = await _check_http(
        "https://gentle-satyr-65.clerk.accounts.dev/v1/environment"
    )
    results["Clerk Auth"] = {"ok": clerk_ok, "message": clerk_msg, "time": f"{clerk_time:.2f}s"}
    if clerk_ok:
        _record_success("Clerk Auth")
    else:
        _record_failure("Clerk Auth", clerk_msg)

    healthy = sum(1 for r in results.values() if r["ok"])
    total = len(results)
    results["_summary"] = {
        "healthy": healthy,
        "total": total,
        "all_ok": healthy == total,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }

    logger.info(
        "Health check complete: %d/%d services healthy", healthy, total
    )
    return results


@celery.task(bind=True, name="tasks.health_monitor")
def health_monitor(self) -> dict:
    """Periodic health check task — runs every 5 minutes."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_run_health_checks())
    finally:
        loop.close()
