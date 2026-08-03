"""Export endpoints — request exports, check status, download files, webhook."""

import logging
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import BadRequestError, NotFoundError
from app.models.export import ExportJob
from app.models.matching import ReconRun, MatchPair, MatchPairItem
from app.models.data_source import DataSourceRow
from app.models.tenant import Tenant
from app.schemas.common import PaginatedResponse
from app.schemas.export import ExportCreate, ExportResponse
from app.storage import get_storage
from app.utils.pagination import paginate

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# POST / — request an export
# ---------------------------------------------------------------------------
@router.post("/", response_model=ExportResponse, status_code=status.HTTP_201_CREATED)
async def create_export(
    payload: ExportCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    # Verify the run exists and belongs to this tenant
    run_result = await db.execute(
        select(ReconRun).where(
            ReconRun.id == payload.run_id,
            ReconRun.tenant_id == tenant.id,
        )
    )
    run = run_result.scalar_one_or_none()
    if not run:
        raise NotFoundError("Reconciliation run")

    export_job = ExportJob(
        tenant_id=tenant.id,
        run_id=payload.run_id,
        export_type=payload.export_type,
        export_scope=payload.export_scope,
        status="pending",
        requested_by=user.get("user_id"),
    )
    db.add(export_job)
    await db.flush()
    await db.refresh(export_job)

    # Queue Celery task (best-effort)
    try:
        from app.tasks.export_tasks import generate_export
        generate_export.delay(str(export_job.id))
    except Exception:
        logger.warning("Could not enqueue export task for %s (Celery may be offline)", export_job.id)

    return export_job


# ---------------------------------------------------------------------------
# GET / — list export history
# ---------------------------------------------------------------------------
@router.get("/", response_model=PaginatedResponse[ExportResponse])
async def list_exports(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    query = (
        select(ExportJob)
        .where(ExportJob.tenant_id == tenant.id)
        .order_by(ExportJob.created_at.desc())
    )
    return await paginate(db, query, page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# GET /{id} — get export status
# ---------------------------------------------------------------------------
@router.get("/{export_id}", response_model=ExportResponse)
async def get_export(
    export_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ExportJob).where(
            ExportJob.id == export_id,
            ExportJob.tenant_id == tenant.id,
        )
    )
    export_job = result.scalar_one_or_none()
    if not export_job:
        raise NotFoundError("Export job")
    return export_job


# ---------------------------------------------------------------------------
# GET /{id}/download — download the exported file
# ---------------------------------------------------------------------------
@router.get("/{export_id}/download")
async def download_export(
    export_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ExportJob).where(
            ExportJob.id == export_id,
            ExportJob.tenant_id == tenant.id,
        )
    )
    export_job = result.scalar_one_or_none()
    if not export_job:
        raise NotFoundError("Export job")

    if export_job.status != "completed" or not export_job.file_path:
        raise BadRequestError("Export is not yet ready for download.")

    storage = get_storage()
    if not await storage.exists(export_job.file_path):
        raise NotFoundError("Export file")

    file_content = await storage.read(export_job.file_path)
    filename = Path(export_job.file_path).name

    # Determine media type
    media_type = "application/octet-stream"
    if export_job.export_type == "csv":
        media_type = "text/csv"
    elif export_job.export_type == "excel":
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    return StreamingResponse(
        iter([file_content]),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Webhook export schemas
# ---------------------------------------------------------------------------
class WebhookExportRequest(BaseModel):
    """Body for sending reconciliation results to an external webhook."""

    run_id: UUID
    webhook_url: str = Field(..., description="External URL to POST results to")
    webhook_headers: dict[str, str] = Field(
        default_factory=dict,
        description="Optional HTTP headers to include in the webhook request",
    )


# ---------------------------------------------------------------------------
# POST /webhook — send results to an external webhook URL
# ---------------------------------------------------------------------------
@router.post("/webhook")
async def export_to_webhook(
    payload: WebhookExportRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Fetch reconciliation run results and POST them as JSON to a webhook URL."""

    # Verify the run exists and belongs to this tenant
    run_result = await db.execute(
        select(ReconRun).where(
            ReconRun.id == payload.run_id,
            ReconRun.tenant_id == tenant.id,
        )
    )
    run = run_result.scalar_one_or_none()
    if not run:
        raise NotFoundError("Reconciliation run")

    # Build the results payload from match pairs
    pairs_result = await db.execute(
        select(MatchPair).where(MatchPair.run_id == run.id)
    )
    pairs = pairs_result.scalars().all()

    results_data = {
        "run_id": str(run.id),
        "reconciliation_id": str(run.reconciliation_id),
        "status": run.status,
        "left_row_count": run.left_row_count,
        "right_row_count": run.right_row_count,
        "matched_count": run.matched_count,
        "unmatched_left": run.unmatched_left,
        "unmatched_right": run.unmatched_right,
        "exception_count": run.exception_count,
        "match_rate": float(run.match_rate) if run.match_rate is not None else None,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "match_pairs": [
            {
                "id": str(p.id),
                "match_status": p.match_status,
                "confidence_score": float(p.confidence_score) if p.confidence_score is not None else None,
                "left_amount": float(p.left_amount) if p.left_amount is not None else None,
                "right_amount": float(p.right_amount) if p.right_amount is not None else None,
                "difference": float(p.difference) if p.difference is not None else None,
            }
            for p in pairs
        ],
    }

    # POST to the webhook
    headers = {"Content-Type": "application/json"}
    headers.update(payload.webhook_headers)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                str(payload.webhook_url),
                json=results_data,
                headers=headers,
            )

        return {
            "success": response.is_success,
            "status_code": response.status_code,
            "message": (
                "Webhook delivered successfully"
                if response.is_success
                else f"Webhook returned status {response.status_code}"
            ),
        }
    except httpx.TimeoutException:
        return {"success": False, "status_code": None, "message": "Webhook request timed out"}
    except httpx.RequestError as exc:
        return {"success": False, "status_code": None, "message": f"Webhook request failed: {exc}"}
