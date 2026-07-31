"""Match learning service — analyzes manual matches to suggest reconciliation rules.

Examines rows that were manually matched by users to discover patterns
(columns that are consistently identical across manual matches), then
suggests those column pairs as candidate matching rules.
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSourceRow
from app.models.matching import MatchPair, MatchPairItem, ReconRun

logger = logging.getLogger(__name__)


async def analyze_manual_matches(
    db: AsyncSession,
    reconciliation_id: uuid.UUID,
) -> list[dict]:
    """Analyze manual matches for a reconciliation and suggest matching rules.

    Steps:
    1. Fetch all MatchPairs with match_status="manual_match" across runs of
       this reconciliation.
    2. For each manual match, retrieve the left and right row data.
    3. Find which columns have identical values between the matched rows.
    4. Count frequency of each column pair being identical across all manual
       matches.
    5. Return suggested rules sorted by frequency (descending).
    """
    # 1. Get all run IDs for this reconciliation
    runs_result = await db.execute(
        select(ReconRun.id).where(ReconRun.reconciliation_id == reconciliation_id)
    )
    run_ids = [r for r in runs_result.scalars().all()]
    if not run_ids:
        return []

    # 2. Fetch all manual match pairs from those runs
    pairs_result = await db.execute(
        select(MatchPair).where(
            MatchPair.run_id.in_(run_ids),
            MatchPair.match_status == "manual_match",
        )
    )
    manual_pairs = pairs_result.scalars().all()
    total_manual = len(manual_pairs)

    if total_manual == 0:
        return []

    # 3. For each pair, get left and right row data, then find identical columns
    # Track frequency: (left_col, right_col) -> count of pairs where they match
    column_pair_counts: dict[tuple[str, str], int] = defaultdict(int)

    for pair in manual_pairs:
        items_result = await db.execute(
            select(MatchPairItem).where(MatchPairItem.match_pair_id == pair.id)
        )
        items = items_result.scalars().all()

        left_data: dict = {}
        right_data: dict = {}

        for item in items:
            row_result = await db.execute(
                select(DataSourceRow).where(DataSourceRow.id == item.data_source_row_id)
            )
            row = row_result.scalar_one_or_none()
            if not row or not row.data:
                continue

            if item.side == "left":
                left_data = row.data
            else:
                right_data = row.data

        if not left_data or not right_data:
            continue

        # Compare every left column against every right column
        for l_col, l_val in left_data.items():
            if l_col.startswith("_"):  # skip internal columns
                continue
            for r_col, r_val in right_data.items():
                if r_col.startswith("_"):
                    continue
                # Check if values are identical (case-insensitive string comparison)
                if l_val is not None and r_val is not None:
                    if str(l_val).strip().lower() == str(r_val).strip().lower():
                        column_pair_counts[(l_col, r_col)] += 1

    # 4. Build suggestions sorted by frequency
    suggestions = []
    for (l_col, r_col), count in column_pair_counts.items():
        confidence = round(count / total_manual, 4)
        # Only suggest pairs that appear in at least 50% of manual matches
        if confidence < 0.5:
            continue

        # Determine suggested match type based on column names
        suggested_match_type = "exact"
        col_names_lower = (l_col + r_col).lower()
        if any(kw in col_names_lower for kw in ("amount", "total", "value", "balance", "sum", "price")):
            suggested_match_type = "tolerance"
        elif any(kw in col_names_lower for kw in ("name", "description", "desc", "memo", "note")):
            suggested_match_type = "fuzzy"

        suggestions.append({
            "left_column": l_col,
            "right_column": r_col,
            "match_count": count,
            "total_manual": total_manual,
            "confidence": confidence,
            "suggested_match_type": suggested_match_type,
        })

    # Sort by frequency descending, then by confidence
    suggestions.sort(key=lambda s: (-s["match_count"], -s["confidence"]))

    return suggestions
