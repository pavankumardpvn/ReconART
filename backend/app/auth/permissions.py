"""Role-Based Access Control (RBAC) dependency for FastAPI endpoints.

Role hierarchy (highest to lowest):
    owner > admin > editor > viewer

Permissions by role:
    viewer  - read-only (GET endpoints)
    editor  - read + write (GET, POST, PATCH)
    admin   - read + write + delete (GET, POST, PATCH, DELETE)
    owner   - everything including tenant management

Usage::

    from app.auth.permissions import require_role

    @router.post("/")
    async def create_item(
        ...,
        _auth: None = Depends(require_role("editor")),
    ):
        ...
"""

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.tenant import Tenant, TenantMember

# Ordered from lowest to highest privilege
ROLE_HIERARCHY: list[str] = ["viewer", "editor", "admin", "owner"]

# Map each role to its numeric level for easy comparison
_ROLE_LEVEL: dict[str, int] = {role: idx for idx, role in enumerate(ROLE_HIERARCHY)}


def _role_level(role: str) -> int:
    """Return the numeric level for a role string, defaulting to -1 if unknown."""
    return _ROLE_LEVEL.get(role, -1)


async def get_user_role(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TenantMember:
    """Resolve the current user's TenantMember record.

    Looks up the TenantMember by the authenticated user_id and the
    resolved tenant.  Returns the TenantMember (which carries ``.role``).

    Raises 401 if the user is not authenticated, or 403 if no membership
    record exists for the current user in the current tenant.
    """
    user_id: str | None = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    # Resolve tenant the same way get_current_tenant does
    org_id: str | None = getattr(request.state, "org_id", None)
    tenant_key = org_id if org_id else f"personal_{user_id}"

    tenant_result = await db.execute(
        select(Tenant).where(Tenant.clerk_org_id == tenant_key)
    )
    tenant = tenant_result.scalar_one_or_none()
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


def require_role(min_role: str):
    """Return a FastAPI dependency that enforces a minimum role.

    Parameters
    ----------
    min_role:
        The minimum role required (one of ``viewer``, ``editor``,
        ``admin``, ``owner``).

    Returns
    -------
    A dependency callable suitable for ``Depends(require_role("editor"))``.

    Raises
    ------
    HTTPException 403
        If the user's role is below *min_role*.
    """
    required_level = _role_level(min_role)
    if required_level < 0:
        raise ValueError(
            f"Unknown role: {min_role!r}. Must be one of {ROLE_HIERARCHY}"
        )

    async def _check_role(
        member: TenantMember = Depends(get_user_role),
    ) -> TenantMember:
        user_level = _role_level(member.role)
        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Insufficient permissions: role '{member.role}' does not "
                    f"meet the minimum required role '{min_role}'"
                ),
            )
        return member

    return _check_role
