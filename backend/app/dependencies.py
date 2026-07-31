"""FastAPI dependencies for auth and tenant resolution."""

import logging

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.tenant import Tenant, TenantMember

logger = logging.getLogger(__name__)


def get_current_user(request: Request) -> dict:
    user_id = getattr(request.state, "user_id", None)
    org_id = getattr(request.state, "org_id", None)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    return {"user_id": user_id, "org_id": org_id}


async def get_current_tenant(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Tenant:
    user_id = getattr(request.state, "user_id", None)
    org_id = getattr(request.state, "org_id", None)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    # Use org_id if available, otherwise fall back to user_id as a personal workspace
    tenant_key = org_id if org_id else f"personal_{user_id}"

    result = await db.execute(
        select(Tenant).where(Tenant.clerk_org_id == tenant_key)
    )
    tenant = result.scalar_one_or_none()

    if tenant is None:
        logger.info("Auto-provisioning tenant for key=%s", tenant_key)
        tenant = Tenant(
            clerk_org_id=tenant_key,
            name="Personal Workspace" if not org_id else f"Organization {org_id}",
            slug=tenant_key.lower().replace("_", "-")[:100],
        )
        db.add(tenant)
        await db.flush()
        await db.refresh(tenant)

    return tenant


async def get_user_role(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TenantMember:
    """Look up the TenantMember record for the current user and tenant.

    This is a convenience re-export of the same logic used by the RBAC
    layer in ``app.auth.permissions``.  It returns the full TenantMember
    object so callers can inspect ``.role`` and other membership fields.

    Raises 401 if the user is not authenticated, or 403 if no membership
    record exists for the current user in the current tenant.
    """
    user_id: str | None = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    org_id: str | None = getattr(request.state, "org_id", None)
    tenant_key = org_id if org_id else f"personal_{user_id}"

    result = await db.execute(
        select(Tenant).where(Tenant.clerk_org_id == tenant_key)
    )
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenant found for current user",
        )

    member_result = await db.execute(
        select(TenantMember).where(
            TenantMember.tenant_id == tenant.id,
            TenantMember.clerk_user_id == user_id,
        )
    )
    member = member_result.scalar_one_or_none()
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization",
        )

    return member
