"""Compliance reporting endpoints (SOX reports, summary dashboards)."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.models.matching import Exception_, ReconRun
from app.models.reconciliation import Reconciliation
from app.models.tenant import Tenant
from app.models.workflow import ReconciliationSignoff, ReconciliationTask

router = APIRouter()


@router.get("/sox-report")
async def sox_report(
    period_from: date = Query(..., description="Start of the reporting period"),
    period_to: date = Query(..., description="End of the reporting period"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Generate a SOX compliance report for the given period.

    For each reconciliation, returns completion status, sign-off status,
    exception count, and resolution rate.
    """
    # -- Fetch all reconciliations for this tenant --
    recon_result = await db.execute(
        select(Reconciliation)
        .where(
            Reconciliation.tenant_id == tenant.id,
            Reconciliation.deleted_at.is_(None),
        )
        .order_by(Reconciliation.name.asc())
    )
    reconciliations = recon_result.scalars().all()

    items = []
    total_reconciliations = len(reconciliations)
    completed_on_time = 0
    total_exceptions = 0
    total_exceptions_resolved = 0
    total_signoffs_completed = 0

    for recon in reconciliations:
        # Runs in the period
        run_result = await db.execute(
            select(ReconRun).where(
                ReconRun.reconciliation_id == recon.id,
                ReconRun.tenant_id == tenant.id,
                ReconRun.created_at >= datetime.combine(
                    period_from, datetime.min.time(), tzinfo=timezone.utc
                ),
                ReconRun.created_at <= datetime.combine(
                    period_to, datetime.max.time(), tzinfo=timezone.utc
                ),
            )
        )
        runs = run_result.scalars().all()
        run_ids = [r.id for r in runs]

        # Completed runs
        completed_runs = [r for r in runs if r.status == "completed"]
        has_completed_run = len(completed_runs) > 0

        # Exceptions for these runs
        exception_count = 0
        resolved_count = 0
        if run_ids:
            exc_result = await db.execute(
                select(
                    func.count(Exception_.id).label("total"),
                    func.count(
                        case(
                            (Exception_.status.in_(["resolved", "ignored"]), Exception_.id),
                            else_=None,
                        )
                    ).label("resolved"),
                ).where(
                    Exception_.run_id.in_(run_ids),
                    Exception_.tenant_id == tenant.id,
                )
            )
            exc_row = exc_result.one()
            exception_count = exc_row.total
            resolved_count = exc_row.resolved

        total_exceptions += exception_count
        total_exceptions_resolved += resolved_count

        # Sign-offs for these runs
        signoff_count = 0
        approved_signoffs = 0
        if run_ids:
            signoff_result = await db.execute(
                select(
                    func.count(ReconciliationSignoff.id).label("total"),
                    func.count(
                        case(
                            (ReconciliationSignoff.status == "approved",
                             ReconciliationSignoff.id),
                            else_=None,
                        )
                    ).label("approved"),
                ).where(
                    ReconciliationSignoff.run_id.in_(run_ids),
                    ReconciliationSignoff.tenant_id == tenant.id,
                )
            )
            signoff_row = signoff_result.one()
            signoff_count = signoff_row.total
            approved_signoffs = signoff_row.approved

        total_signoffs_completed += approved_signoffs

        # Tasks completed on time (due within period)
        task_result = await db.execute(
            select(
                func.count(ReconciliationTask.id).label("total_tasks"),
                func.count(
                    case(
                        (ReconciliationTask.status == "completed",
                         ReconciliationTask.id),
                        else_=None,
                    )
                ).label("completed_tasks"),
            ).where(
                ReconciliationTask.reconciliation_id == recon.id,
                ReconciliationTask.tenant_id == tenant.id,
                ReconciliationTask.due_date >= period_from,
                ReconciliationTask.due_date <= period_to,
            )
        )
        task_row = task_result.one()

        resolution_rate = (
            round(resolved_count / exception_count * 100, 2)
            if exception_count > 0
            else 100.0
        )

        if has_completed_run and approved_signoffs > 0:
            completed_on_time += 1

        items.append({
            "reconciliation_id": str(recon.id),
            "reconciliation_name": recon.name,
            "total_runs": len(runs),
            "completed_runs": len(completed_runs),
            "completion_status": "completed" if has_completed_run else "incomplete",
            "signoff_total": signoff_count,
            "signoff_approved": approved_signoffs,
            "signoff_status": (
                "approved" if approved_signoffs > 0
                else "pending" if signoff_count > 0
                else "none"
            ),
            "exception_count": exception_count,
            "exceptions_resolved": resolved_count,
            "resolution_rate": resolution_rate,
            "tasks_total": task_row.total_tasks,
            "tasks_completed": task_row.completed_tasks,
        })

    return {
        "period_from": period_from.isoformat(),
        "period_to": period_to.isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_reconciliations": total_reconciliations,
        "completed_on_time": completed_on_time,
        "exceptions_total": total_exceptions,
        "exceptions_resolved": total_exceptions_resolved,
        "signoffs_completed": total_signoffs_completed,
        "items": items,
    }


@router.get("/summary")
async def compliance_summary(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Overall compliance dashboard data -- aggregated across all reconciliations."""
    today = date.today()

    # Total reconciliations
    recon_count_result = await db.execute(
        select(func.count(Reconciliation.id)).where(
            Reconciliation.tenant_id == tenant.id,
            Reconciliation.deleted_at.is_(None),
        )
    )
    total_reconciliations = recon_count_result.scalar_one()

    # Sign-off stats
    signoff_result = await db.execute(
        select(
            ReconciliationSignoff.status,
            func.count(ReconciliationSignoff.id).label("count"),
        )
        .where(ReconciliationSignoff.tenant_id == tenant.id)
        .group_by(ReconciliationSignoff.status)
    )
    signoff_stats = {row.status: row.count for row in signoff_result.all()}

    # Exception stats
    exception_result = await db.execute(
        select(
            Exception_.status,
            func.count(Exception_.id).label("count"),
        )
        .where(Exception_.tenant_id == tenant.id)
        .group_by(Exception_.status)
    )
    exception_stats = {row.status: row.count for row in exception_result.all()}
    total_exceptions = sum(exception_stats.values())
    resolved_exceptions = (
        exception_stats.get("resolved", 0) + exception_stats.get("ignored", 0)
    )

    # Task stats
    task_result = await db.execute(
        select(
            ReconciliationTask.status,
            func.count(ReconciliationTask.id).label("count"),
        )
        .where(ReconciliationTask.tenant_id == tenant.id)
        .group_by(ReconciliationTask.status)
    )
    task_stats = {row.status: row.count for row in task_result.all()}

    # Overdue tasks
    overdue_result = await db.execute(
        select(func.count(ReconciliationTask.id)).where(
            ReconciliationTask.tenant_id == tenant.id,
            ReconciliationTask.due_date < today,
            ReconciliationTask.status.notin_(["completed"]),
        )
    )
    overdue_count = overdue_result.scalar_one()

    # Run stats (last 30 days)
    from datetime import timedelta

    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    run_result = await db.execute(
        select(
            ReconRun.status,
            func.count(ReconRun.id).label("count"),
        )
        .where(
            ReconRun.tenant_id == tenant.id,
            ReconRun.created_at >= thirty_days_ago,
        )
        .group_by(ReconRun.status)
    )
    run_stats = {row.status: row.count for row in run_result.all()}

    return {
        "total_reconciliations": total_reconciliations,
        "signoffs": {
            "pending_review": signoff_stats.get("pending_review", 0),
            "approved": signoff_stats.get("approved", 0),
            "rejected": signoff_stats.get("rejected", 0),
            "total": sum(signoff_stats.values()),
        },
        "exceptions": {
            "open": exception_stats.get("open", 0),
            "investigating": exception_stats.get("investigating", 0),
            "resolved": exception_stats.get("resolved", 0),
            "ignored": exception_stats.get("ignored", 0),
            "total": total_exceptions,
            "resolution_rate": (
                round(resolved_exceptions / total_exceptions * 100, 2)
                if total_exceptions > 0
                else 100.0
            ),
        },
        "tasks": {
            "pending": task_stats.get("pending", 0),
            "in_progress": task_stats.get("in_progress", 0),
            "completed": task_stats.get("completed", 0),
            "overdue": overdue_count,
            "total": sum(task_stats.values()),
        },
        "runs_last_30_days": {
            "completed": run_stats.get("completed", 0),
            "failed": run_stats.get("failed", 0),
            "pending": run_stats.get("pending", 0),
            "running": run_stats.get("running", 0),
            "total": sum(run_stats.values()),
        },
    }
