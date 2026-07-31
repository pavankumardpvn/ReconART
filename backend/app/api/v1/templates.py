"""Reconciliation template endpoints — save, list, and apply templates."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import NotFoundError
from app.models.reconciliation import Reconciliation, ReconRule, ReconRuleCondition
from app.models.tenant import Tenant
from app.schemas.common import PaginatedResponse
from app.schemas.reconciliation import ReconRuleConditionCreate, ReconRuleCreate
from app.utils.pagination import paginate

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TemplateCreate(BaseModel):
    """Create a new reconciliation template (no sources assigned)."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    recon_type: str = Field(..., description="'one_to_one', 'one_to_many', 'many_to_many'")
    tolerance_amount: float = Field(default=0, ge=0)
    tolerance_percent: float = Field(default=0, ge=0, le=100)
    rules: list[ReconRuleCreate] = Field(default_factory=list)


class TemplateResponse(BaseModel):
    """Template detail returned to clients."""
    id: UUID
    name: str
    description: str | None = None
    recon_type: str
    tolerance_amount: float
    tolerance_percent: float
    status: str
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class TemplateApply(BaseModel):
    """Apply a template to create a new reconciliation with sources."""
    name: str = Field(..., min_length=1, max_length=255)
    left_source_id: UUID
    right_source_id: UUID
    left_source_label: str | None = None
    right_source_label: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_template_or_404(
    template_id: UUID,
    tenant: Tenant,
    db: AsyncSession,
    *,
    load_rules: bool = False,
) -> Reconciliation:
    query = select(Reconciliation).where(
        Reconciliation.id == template_id,
        Reconciliation.tenant_id == tenant.id,
        Reconciliation.status == "template",
        Reconciliation.deleted_at.is_(None),
    )
    if load_rules:
        query = query.options(
            selectinload(Reconciliation.rules).selectinload(ReconRule.conditions)
        )
    result = await db.execute(query)
    template = result.scalar_one_or_none()
    if not template:
        raise NotFoundError("Template")
    return template


# ---------------------------------------------------------------------------
# GET / — list all templates
# ---------------------------------------------------------------------------
@router.get("/", response_model=PaginatedResponse[TemplateResponse])
async def list_templates(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    query = (
        select(Reconciliation)
        .where(
            Reconciliation.tenant_id == tenant.id,
            Reconciliation.status == "template",
            Reconciliation.deleted_at.is_(None),
        )
        .order_by(Reconciliation.created_at.desc())
    )
    return await paginate(db, query, page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# POST / — create a new template
# ---------------------------------------------------------------------------
@router.post("/", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    template = Reconciliation(
        tenant_id=tenant.id,
        name=payload.name,
        description=payload.description,
        recon_type=payload.recon_type,
        # Templates have no sources — set to None-safe sentinel (NULL not allowed
        # in the FK column, so we skip setting them; they stay as model defaults
        # would require a schema change). We use nullable workaround below.
        tolerance_amount=payload.tolerance_amount,
        tolerance_percent=payload.tolerance_percent,
        status="template",
    )
    db.add(template)
    await db.flush()

    # Create rules and conditions
    for rule_payload in payload.rules:
        rule = ReconRule(
            tenant_id=tenant.id,
            reconciliation_id=template.id,
            name=rule_payload.name or f"Rule {rule_payload.priority}",
            match_type=rule_payload.match_type,
            priority=rule_payload.priority,
        )
        db.add(rule)
        await db.flush()

        for cond in rule_payload.conditions:
            condition = ReconRuleCondition(
                rule_id=rule.id,
                left_column=cond.left_column,
                right_column=cond.right_column,
                comparison=cond.comparison,
                tolerance_value=cond.tolerance_value,
                fuzzy_threshold=cond.fuzzy_threshold,
                is_key=cond.is_key,
            )
            db.add(condition)

    await db.flush()
    await db.refresh(template)
    return template


# ---------------------------------------------------------------------------
# GET /{id} — get template detail
# ---------------------------------------------------------------------------
@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    return await _get_template_or_404(template_id, tenant, db, load_rules=True)


# ---------------------------------------------------------------------------
# DELETE /{id} — soft-delete a template
# ---------------------------------------------------------------------------
@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    from datetime import datetime, timezone
    template = await _get_template_or_404(template_id, tenant, db)
    template.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return None


# ---------------------------------------------------------------------------
# POST /{id}/apply — create a reconciliation from a template
# ---------------------------------------------------------------------------
@router.post("/{template_id}/apply", status_code=status.HTTP_201_CREATED)
async def apply_template(
    template_id: UUID,
    payload: TemplateApply,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Clone template rules into a new reconciliation with the provided sources."""
    template = await _get_template_or_404(template_id, tenant, db, load_rules=True)

    # Create new reconciliation from template
    recon = Reconciliation(
        tenant_id=tenant.id,
        name=payload.name,
        description=template.description,
        recon_type=template.recon_type,
        left_source_id=payload.left_source_id,
        right_source_id=payload.right_source_id,
        left_source_label=payload.left_source_label or "Source A",
        right_source_label=payload.right_source_label or "Source B",
        tolerance_amount=template.tolerance_amount,
        tolerance_percent=template.tolerance_percent,
        status="draft",
    )
    db.add(recon)
    await db.flush()

    # Clone rules and conditions
    for tmpl_rule in template.rules:
        rule = ReconRule(
            tenant_id=tenant.id,
            reconciliation_id=recon.id,
            name=tmpl_rule.name,
            match_type=tmpl_rule.match_type,
            priority=tmpl_rule.priority,
        )
        db.add(rule)
        await db.flush()

        for tmpl_cond in tmpl_rule.conditions:
            condition = ReconRuleCondition(
                rule_id=rule.id,
                left_column=tmpl_cond.left_column,
                right_column=tmpl_cond.right_column,
                comparison=tmpl_cond.comparison,
                tolerance_value=tmpl_cond.tolerance_value,
                fuzzy_threshold=tmpl_cond.fuzzy_threshold,
                is_key=tmpl_cond.is_key,
            )
            db.add(condition)

    await db.flush()
    await db.refresh(recon)

    return {
        "id": str(recon.id),
        "name": recon.name,
        "status": recon.status,
        "recon_type": recon.recon_type,
        "template_id": str(template.id),
        "template_name": template.name,
        "message": f"Reconciliation created from template '{template.name}'",
    }
