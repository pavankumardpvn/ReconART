"""Anomaly detection service for data source rows.

Inspects all rows in a data source and flags anomalies:
- Statistical outliers: numeric values > 3 standard deviations from the mean
- Date gaps: gaps between consecutive dates > 2x the median gap
- Duplicates: rows that are identical across all columns
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from datetime import datetime
from decimal import Decimal, InvalidOperation
from math import sqrt
from statistics import median

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSourceRow

logger = logging.getLogger(__name__)

# Common date formats to try when parsing
_DATE_FORMATS = [
    "%Y-%m-%d",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S.%f",
    "%m/%d/%Y",
    "%d/%m/%Y",
    "%Y/%m/%d",
    "%m-%d-%Y",
    "%d-%m-%Y",
]


def _try_parse_date(val: str) -> datetime | None:
    """Attempt to parse a string as a date using common formats."""
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(val.strip(), fmt)
        except (ValueError, AttributeError):
            continue
    return None


def _try_parse_number(val) -> float | None:
    """Attempt to parse a value as a float."""
    if val is None:
        return None
    try:
        return float(Decimal(str(val)))
    except (InvalidOperation, TypeError, ValueError):
        return None


async def detect_anomalies(
    db: AsyncSession,
    data_source_id: uuid.UUID,
    tenant_id: uuid.UUID,
) -> list[dict]:
    """Detect anomalies in a data source's rows.

    Returns a list of anomaly records, each describing a specific issue found
    in a particular row/column.
    """
    result = await db.execute(
        select(DataSourceRow)
        .where(
            DataSourceRow.data_source_id == data_source_id,
            DataSourceRow.tenant_id == tenant_id,
        )
        .order_by(DataSourceRow.row_number)
    )
    rows = result.scalars().all()

    if not rows:
        return []

    anomalies: list[dict] = []

    # Collect all column values across rows
    numeric_columns: dict[str, list[tuple[int, uuid.UUID, float]]] = defaultdict(list)
    date_columns: dict[str, list[tuple[int, uuid.UUID, datetime]]] = defaultdict(list)
    all_row_data: list[tuple[int, uuid.UUID, dict]] = []

    for row in rows:
        data = row.data or {}
        all_row_data.append((row.row_number, row.id, data))

        for col, val in data.items():
            if col.startswith("_"):
                continue

            num = _try_parse_number(val)
            if num is not None:
                numeric_columns[col].append((row.row_number, row.id, num))
                continue

            if isinstance(val, str):
                dt = _try_parse_date(val)
                if dt is not None:
                    date_columns[col].append((row.row_number, row.id, dt))

    # 1. Statistical outliers for numeric columns
    for col, entries in numeric_columns.items():
        if len(entries) < 3:
            continue

        values = [e[2] for e in entries]
        n = len(values)
        mean = sum(values) / n
        variance = sum((v - mean) ** 2 for v in values) / n
        std_dev = sqrt(variance) if variance > 0 else 0.0

        if std_dev == 0:
            continue

        for row_number, row_id, val in entries:
            z_score = abs(val - mean) / std_dev
            if z_score > 3.0:
                anomalies.append({
                    "row_id": str(row_id),
                    "row_number": row_number,
                    "anomaly_type": "statistical_outlier",
                    "column": col,
                    "value": val,
                    "expected_range": f"{round(mean - 3 * std_dev, 2)} to {round(mean + 3 * std_dev, 2)}",
                    "severity": "high",
                    "details": f"Z-score: {round(z_score, 2)}, mean: {round(mean, 2)}, std_dev: {round(std_dev, 2)}",
                })

    # 2. Date gap anomalies
    for col, entries in date_columns.items():
        if len(entries) < 3:
            continue

        # Sort by date
        sorted_entries = sorted(entries, key=lambda e: e[2])

        # Compute gaps in days
        gaps: list[tuple[int, uuid.UUID, float]] = []
        for i in range(1, len(sorted_entries)):
            gap_days = (sorted_entries[i][2] - sorted_entries[i - 1][2]).total_seconds() / 86400
            gaps.append((sorted_entries[i][0], sorted_entries[i][1], gap_days))

        if not gaps:
            continue

        gap_values = [g[2] for g in gaps]
        median_gap = median(gap_values)

        if median_gap <= 0:
            continue

        threshold = median_gap * 2

        for row_number, row_id, gap in gaps:
            if gap > threshold:
                anomalies.append({
                    "row_id": str(row_id),
                    "row_number": row_number,
                    "anomaly_type": "date_gap",
                    "column": col,
                    "value": round(gap, 1),
                    "expected_range": f"Gap <= {round(threshold, 1)} days (median: {round(median_gap, 1)})",
                    "severity": "medium",
                    "details": f"Gap of {round(gap, 1)} days exceeds 2x median gap of {round(median_gap, 1)} days",
                })

    # 3. Duplicate rows
    seen: dict[str, list[tuple[int, uuid.UUID]]] = defaultdict(list)
    for row_number, row_id, data in all_row_data:
        # Create a fingerprint excluding internal columns
        fingerprint_parts = []
        for k in sorted(data.keys()):
            if not k.startswith("_"):
                fingerprint_parts.append(f"{k}={data[k]}")
        fingerprint = "|".join(fingerprint_parts)
        seen[fingerprint].append((row_number, row_id))

    for fingerprint, occurrences in seen.items():
        if len(occurrences) > 1:
            # Mark all but the first as duplicates
            for row_number, row_id in occurrences[1:]:
                anomalies.append({
                    "row_id": str(row_id),
                    "row_number": row_number,
                    "anomaly_type": "duplicate_row",
                    "column": "*",
                    "value": f"Duplicate of row {occurrences[0][0]}",
                    "expected_range": "Unique",
                    "severity": "medium",
                    "details": f"Identical to row {occurrences[0][0]} across all columns",
                })

    return anomalies
