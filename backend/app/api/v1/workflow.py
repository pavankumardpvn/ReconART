"""Workflow endpoints: sign-offs, tasks, comments, and attachments."""

from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import BadRequestError, NotFoundError
from app.models.tenant import Tenant
from app.models.workflow import (
    Attachment,
    Comment,
    ReconciliationSignoff,
    ReconciliationTask,
)
from app.storage import get_storage
from app.utils.pagination import paginate

router = APIRouter()

# ---------------------------------------------------------------------------
# Storage helper (used by attachment endpoints)
# ---------------------------------------------------------------------------
_storage = get_storage()


# ---------------------------------------------------------------------------
# Pydantic request / response schemas
# ---------------------------------------------------------------------------

# --- Signoff ---

class SignoffCreate(BaseModel):
    reconciliation_id: UUID
    run_id: UUID
    notes: str | None = None


class SignoffApprove(BaseModel):
    notes: str | None = None


class SignoffReject(BaseModel):
    notes: str


# --- Tasks ---

class TaskCreate(BaseModel):
    reconciliation_id: UUID
    title: str
    description: str | None = None
    assigned_to: str
    due_date: date
    priority: str = "medium"


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    assigned_to: str | None = None
    due_date: date | None = None
    priority: str | None = None
    status: str | None = None


# --- Comments ---

class CommentCreate(BaseModel):
    entity_type: str
    entity_id: UUID
    text: str
    parent_id: UUID | None = None


# ============================================================================
# 1. SIGN-OFF ENDPOINTS
# ============================================================================

@router.post("/signoff", status_code=status.HTTP_201_CREATED)
async def create_signoff(
    payload: SignoffCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    """Create a sign-off request (preparer submits a run for review)."""
    signoff = ReconciliationSignoff(
        tenant_id=tenant.id,
        reconciliation_id=payload.reconciliation_id,
        run_id=payload.run_id,
        prepared_by=user["user_id"],
        prepared_at=datetime.now(timezone.utc),
        preparer_notes=payload.notes,
        status="pending_review",
    )
    db.add(signoff)
    await db.flush()
    await db.refresh(signoff)
    return signoff


@router.get("/signoff")
async def list_signoffs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status"),
    reconciliation_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """List sign-off requests, optionally filtered by status or reconciliation."""
    query = (
        select(ReconciliationSignoff)
        .where(ReconciliationSignoff.tenant_id == tenant.id)
        .order_by(ReconciliationSignoff.created_at.desc())
    )
    if status_filter:
        query = query.where(ReconciliationSignoff.status == status_filter)
    if reconciliation_id:
        query = query.where(
            ReconciliationSignoff.reconciliation_id == reconciliation_id
        )

    return await paginate(db, query, page=page, page_size=page_size)


@router.get("/signoff/{signoff_id}")
async def get_signoff(
    signoff_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Get a single sign-off by ID."""
    result = await db.execute(
        select(ReconciliationSignoff).where(
            ReconciliationSignoff.id == signoff_id,
            ReconciliationSignoff.tenant_id == tenant.id,
        )
    )
    signoff = result.scalar_one_or_none()
    if not signoff:
        raise NotFoundError("Signoff")
    return signoff


@router.patch("/signoff/{signoff_id}/approve")
async def approve_signoff(
    signoff_id: UUID,
    payload: SignoffApprove | None = None,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    """Reviewer approves a sign-off request."""
    result = await db.execute(
        select(ReconciliationSignoff).where(
            ReconciliationSignoff.id == signoff_id,
            ReconciliationSignoff.tenant_id == tenant.id,
        )
    )
    signoff = result.scalar_one_or_none()
    if not signoff:
        raise NotFoundError("Signoff")
    if signoff.status != "pending_review":
        raise BadRequestError(
            f"Cannot approve a signoff with status '{signoff.status}'"
        )

    signoff.status = "approved"
    signoff.reviewed_by = user["user_id"]
    signoff.reviewed_at = datetime.now(timezone.utc)
    if payload and payload.notes:
        signoff.reviewer_notes = payload.notes

    await db.flush()
    await db.refresh(signoff)
    return signoff


@router.patch("/signoff/{signoff_id}/reject")
async def reject_signoff(
    signoff_id: UUID,
    payload: SignoffReject,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    """Reviewer rejects a sign-off request with mandatory notes."""
    result = await db.execute(
        select(ReconciliationSignoff).where(
            ReconciliationSignoff.id == signoff_id,
            ReconciliationSignoff.tenant_id == tenant.id,
        )
    )
    signoff = result.scalar_one_or_none()
    if not signoff:
        raise NotFoundError("Signoff")
    if signoff.status != "pending_review":
        raise BadRequestError(
            f"Cannot reject a signoff with status '{signoff.status}'"
        )

    signoff.status = "rejected"
    signoff.reviewed_by = user["user_id"]
    signoff.reviewed_at = datetime.now(timezone.utc)
    signoff.reviewer_notes = payload.notes

    await db.flush()
    await db.refresh(signoff)
    return signoff


# ============================================================================
# 2. TASK / CALENDAR ENDPOINTS
# ============================================================================

@router.post("/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Create a reconciliation task with a due date."""
    task = ReconciliationTask(
        tenant_id=tenant.id,
        reconciliation_id=payload.reconciliation_id,
        title=payload.title,
        description=payload.description,
        assigned_to=payload.assigned_to,
        due_date=payload.due_date,
        priority=payload.priority,
        status="pending",
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)
    return task


@router.get("/tasks")
async def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status"),
    assigned_to: str | None = None,
    due_from: date | None = None,
    due_to: date | None = None,
    priority: str | None = None,
    reconciliation_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """List tasks with optional filters."""
    query = (
        select(ReconciliationTask)
        .where(ReconciliationTask.tenant_id == tenant.id)
        .order_by(ReconciliationTask.due_date.asc())
    )
    if status_filter:
        query = query.where(ReconciliationTask.status == status_filter)
    if assigned_to:
        query = query.where(ReconciliationTask.assigned_to == assigned_to)
    if due_from:
        query = query.where(ReconciliationTask.due_date >= due_from)
    if due_to:
        query = query.where(ReconciliationTask.due_date <= due_to)
    if priority:
        query = query.where(ReconciliationTask.priority == priority)
    if reconciliation_id:
        query = query.where(
            ReconciliationTask.reconciliation_id == reconciliation_id
        )

    return await paginate(db, query, page=page, page_size=page_size)


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: UUID,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Update a task (status, assignment, etc.)."""
    result = await db.execute(
        select(ReconciliationTask).where(
            ReconciliationTask.id == task_id,
            ReconciliationTask.tenant_id == tenant.id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise NotFoundError("Task")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(task, key, value)

    # Auto-set completed_at when status changes to completed
    if payload.status == "completed" and task.completed_at is None:
        task.completed_at = datetime.now(timezone.utc)
    elif payload.status and payload.status != "completed":
        task.completed_at = None

    await db.flush()
    await db.refresh(task)
    return task


@router.get("/tasks/calendar")
async def tasks_calendar(
    due_from: date | None = None,
    due_to: date | None = None,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Return tasks grouped by due_date for calendar view."""
    query = (
        select(ReconciliationTask)
        .where(ReconciliationTask.tenant_id == tenant.id)
        .order_by(ReconciliationTask.due_date.asc())
    )
    if due_from:
        query = query.where(ReconciliationTask.due_date >= due_from)
    if due_to:
        query = query.where(ReconciliationTask.due_date <= due_to)

    result = await db.execute(query)
    tasks = result.scalars().all()

    # Group by due_date
    calendar: dict[str, list] = {}
    for task in tasks:
        key = task.due_date.isoformat()
        if key not in calendar:
            calendar[key] = []
        calendar[key].append({
            "id": str(task.id),
            "title": task.title,
            "reconciliation_id": str(task.reconciliation_id),
            "assigned_to": task.assigned_to,
            "priority": task.priority,
            "status": task.status,
        })

    return {"calendar": calendar}


@router.get("/tasks/overdue")
async def overdue_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Return tasks past their due date that are not completed."""
    today = date.today()
    query = (
        select(ReconciliationTask)
        .where(
            ReconciliationTask.tenant_id == tenant.id,
            ReconciliationTask.due_date < today,
            ReconciliationTask.status.notin_(["completed"]),
        )
        .order_by(ReconciliationTask.due_date.asc())
    )
    return await paginate(db, query, page=page, page_size=page_size)


# ============================================================================
# 3. COMMENT / NOTES ENDPOINTS
# ============================================================================

@router.post("/comments", status_code=status.HTTP_201_CREATED)
async def create_comment(
    payload: CommentCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    """Create a comment on any entity."""
    comment = Comment(
        tenant_id=tenant.id,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        user_id=user["user_id"],
        text=payload.text,
        parent_id=payload.parent_id,
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)
    return comment


@router.get("/comments")
async def list_comments(
    entity_type: str = Query(...),
    entity_id: UUID = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """List comments for a specific entity, ordered oldest-first."""
    query = (
        select(Comment)
        .where(
            Comment.tenant_id == tenant.id,
            Comment.entity_type == entity_type,
            Comment.entity_id == entity_id,
        )
        .order_by(Comment.created_at.asc())
    )
    return await paginate(db, query, page=page, page_size=page_size)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    """Delete a comment (only by its author)."""
    result = await db.execute(
        select(Comment).where(
            Comment.id == comment_id,
            Comment.tenant_id == tenant.id,
        )
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise NotFoundError("Comment")
    if comment.user_id != user["user_id"]:
        raise BadRequestError("You can only delete your own comments")

    await db.delete(comment)
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ============================================================================
# 4. ATTACHMENT ENDPOINTS
# ============================================================================

@router.post("/attachments", status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    file: UploadFile = File(...),
    entity_type: str = Form(...),
    entity_id: UUID = Form(...),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    """Upload a file attachment linked to an entity."""
    content = await file.read()

    stored_path = await _storage.save(
        tenant_id=str(tenant.id),
        filename=file.filename or "unnamed",
        content=content,
    )

    attachment = Attachment(
        tenant_id=tenant.id,
        entity_type=entity_type,
        entity_id=entity_id,
        filename=file.filename or "unnamed",
        file_path=stored_path,
        file_size_bytes=len(content),
        content_type=file.content_type or "application/octet-stream",
        uploaded_by=user["user_id"],
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)
    return attachment


@router.get("/attachments")
async def list_attachments(
    entity_type: str = Query(...),
    entity_id: UUID = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """List attachments for a given entity."""
    query = (
        select(Attachment)
        .where(
            Attachment.tenant_id == tenant.id,
            Attachment.entity_type == entity_type,
            Attachment.entity_id == entity_id,
        )
        .order_by(Attachment.created_at.desc())
    )
    return await paginate(db, query, page=page, page_size=page_size)


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Download an attachment's file contents."""
    result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.tenant_id == tenant.id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise NotFoundError("Attachment")

    try:
        content = await _storage.read(attachment.file_path)
    except FileNotFoundError:
        raise NotFoundError("Attachment file")

    return Response(
        content=content,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{attachment.filename}"'
        },
    )


@router.delete(
    "/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_attachment(
    attachment_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    """Delete an attachment and its stored file."""
    result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.tenant_id == tenant.id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise NotFoundError("Attachment")

    # Remove physical file (no-op if already gone)
    await _storage.delete(attachment.file_path)
    await db.delete(attachment)
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
