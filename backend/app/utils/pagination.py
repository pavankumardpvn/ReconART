"""Pagination helper for SQLAlchemy async queries."""

import math

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.schemas.common import PaginatedResponse


async def paginate(
    session: AsyncSession,
    query: Select,
    page: int = 1,
    page_size: int = 100,
) -> PaginatedResponse:
    """Execute *query* with pagination and return a ``PaginatedResponse``.

    Args:
        session: An active async database session.
        query: A SQLAlchemy ``Select`` statement.
        page: 1-indexed page number.
        page_size: Number of rows per page.

    Returns:
        A ``PaginatedResponse`` containing the page of items plus metadata.
    """
    # Count total rows (wraps the original query in a sub-select)
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.execute(count_query)
    total: int = total_result.scalar_one()

    total_pages = math.ceil(total / page_size) if total > 0 else 0

    # Fetch the requested page
    offset = (page - 1) * page_size
    paginated_query = query.offset(offset).limit(page_size)
    result = await session.execute(paginated_query)
    items = list(result.scalars().all())

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
