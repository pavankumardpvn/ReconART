"""Tenant management endpoints — current tenant info, updates, members, and invites."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.models.tenant import Tenant, TenantMember

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class TenantResponse(BaseModel):
    id: str
    clerk_org_id: str
    name: str
    slug: str
    plan: str
    settings: dict | None = None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class TenantUpdate(BaseModel):
    name: str | None = None
    settings: dict | None = None


class TenantMemberResponse(BaseModel):
    id: str
    clerk_user_id: str
    email: str
    role: str
    invited_at: str | None = None
    joined_at: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class InviteRequest(BaseModel):
    email: str
    role: str = "viewer"


class RoleUpdateRequest(BaseModel):
    role: str


# ---------------------------------------------------------------------------
# GET /me — current tenant info
# ---------------------------------------------------------------------------
@router.get("/me", response_model=TenantResponse)
async def get_current_tenant_info(
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Return the current tenant's profile."""
    return TenantResponse(
        id=str(tenant.id),
        clerk_org_id=tenant.clerk_org_id,
        name=tenant.name,
        slug=tenant.slug,
        plan=tenant.plan,
        settings=tenant.settings,
        created_at=tenant.created_at.isoformat(),
        updated_at=tenant.updated_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# PATCH /me — update tenant name / settings
# ---------------------------------------------------------------------------
@router.patch("/me", response_model=TenantResponse)
async def update_current_tenant(
    payload: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Update the current tenant's name and/or settings."""
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update.",
        )

    for key, value in update_data.items():
        setattr(tenant, key, value)

    await db.flush()
    await db.refresh(tenant)

    return TenantResponse(
        id=str(tenant.id),
        clerk_org_id=tenant.clerk_org_id,
        name=tenant.name,
        slug=tenant.slug,
        plan=tenant.plan,
        settings=tenant.settings,
        created_at=tenant.created_at.isoformat(),
        updated_at=tenant.updated_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# GET /me/members — list tenant members
# ---------------------------------------------------------------------------
@router.get("/me/members", response_model=list[TenantMemberResponse])
async def list_tenant_members(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """List all members of the current tenant."""
    result = await db.execute(
        select(TenantMember)
        .where(TenantMember.tenant_id == tenant.id)
        .order_by(TenantMember.created_at)
    )
    members = result.scalars().all()

    return [
        TenantMemberResponse(
            id=str(m.id),
            clerk_user_id=m.clerk_user_id,
            email=m.email,
            role=m.role,
            invited_at=m.invited_at.isoformat() if m.invited_at else None,
            joined_at=m.joined_at.isoformat() if m.joined_at else None,
            created_at=m.created_at.isoformat(),
        )
        for m in members
    ]


# ---------------------------------------------------------------------------
# POST /me/invite — invite a user by email
# ---------------------------------------------------------------------------
@router.post("/me/invite", response_model=TenantMemberResponse, status_code=status.HTTP_201_CREATED)
async def invite_member(
    payload: InviteRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Invite a user to the current tenant by email."""
    # Check if member already exists
    existing = await db.execute(
        select(TenantMember).where(
            TenantMember.tenant_id == tenant.id,
            TenantMember.email == payload.email,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A member with this email already exists.",
        )

    member = TenantMember(
        tenant_id=tenant.id,
        clerk_user_id=f"invited_{payload.email}",
        email=payload.email,
        role=payload.role,
        invited_at=datetime.now(timezone.utc),
    )
    db.add(member)
    await db.flush()
    await db.refresh(member)

    # Send invitation email (best-effort)
    try:
        from app.services.email_service import send_invite_email
        send_invite_email(payload.email, tenant.name)
    except Exception:
        logger.warning("Could not send invite email to %s", payload.email)

    return TenantMemberResponse(
        id=str(member.id),
        clerk_user_id=member.clerk_user_id,
        email=member.email,
        role=member.role,
        invited_at=member.invited_at.isoformat() if member.invited_at else None,
        joined_at=None,
        created_at=member.created_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# POST /me/members/{member_id}/role — update a member's role
# ---------------------------------------------------------------------------
@router.post("/me/members/{member_id}/role", response_model=TenantMemberResponse)
async def update_member_role(
    member_id: UUID,
    payload: RoleUpdateRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Update a tenant member's role."""
    result = await db.execute(
        select(TenantMember).where(
            TenantMember.id == member_id,
            TenantMember.tenant_id == tenant.id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found.",
        )

    valid_roles = {"admin", "editor", "viewer"}
    if payload.role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {', '.join(sorted(valid_roles))}",
        )

    member.role = payload.role
    await db.flush()
    await db.refresh(member)

    return TenantMemberResponse(
        id=str(member.id),
        clerk_user_id=member.clerk_user_id,
        email=member.email,
        role=member.role,
        invited_at=member.invited_at.isoformat() if member.invited_at else None,
        joined_at=member.joined_at.isoformat() if member.joined_at else None,
        created_at=member.created_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# GET /me/branding — get white-label branding settings
# ---------------------------------------------------------------------------
class BrandingSettings(BaseModel):
    app_name: str = "Recon ART"
    logo_url: str = ""
    primary_color: str = "#06b6d4"
    accent_color: str = "#8b5cf6"


@router.get("/me/branding")
async def get_branding(
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Return the tenant's white-label branding configuration."""
    tenant_settings = tenant.settings or {}
    branding = tenant_settings.get("branding", {})
    return BrandingSettings(**branding).model_dump()


# ---------------------------------------------------------------------------
# PATCH /me/branding — update white-label branding settings
# ---------------------------------------------------------------------------
@router.patch("/me/branding")
async def update_branding(
    payload: BrandingSettings,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Update the tenant's white-label branding configuration."""
    current_settings = tenant.settings or {}
    current_settings["branding"] = payload.model_dump()
    tenant.settings = current_settings
    await db.flush()
    await db.refresh(tenant)
    return payload.model_dump()
