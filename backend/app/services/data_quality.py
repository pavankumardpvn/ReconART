"""Data quality scoring engine.

Evaluates completeness, uniqueness, and format consistency of a dataset
and returns a single composite score along with detailed sub-scores.
"""

from __future__ import annotations


def score_data_quality(rows: list[dict], columns: list[dict]) -> dict:
    """Score data quality on completeness, consistency, and uniqueness.

    Parameters
    ----------
    rows : list[dict]
        Row data (each row is a dict of column_name -> value).
    columns : list[dict]
        Column metadata (each item must have at least a ``name`` key;
        optionally ``data_type``).

    Returns
    -------
    dict
        Quality report with overall_score and sub-metric breakdowns.
    """
    if not rows or not columns:
        return {
            "overall_score": 0.0,
            "completeness": 0.0,
            "uniqueness": 0.0,
            "consistency": 0.0,
            "null_count": 0,
            "duplicate_count": 0,
            "format_issues": 0,
            "total_rows": len(rows),
            "total_columns": len(columns),
        }

    col_names = [c["name"] for c in columns if c.get("name")]
    total_cells = len(rows) * len(col_names)

    # --- Completeness: % of non-null cells ---
    null_count = 0
    for row in rows:
        for col_name in col_names:
            if row.get(col_name) is None:
                null_count += 1

    completeness = (total_cells - null_count) / total_cells * 100 if total_cells > 0 else 0

    # --- Uniqueness: % of non-duplicate rows ---
    seen: set[tuple] = set()
    duplicate_count = 0
    for row in rows:
        key = tuple(sorted((k, str(v)) for k, v in row.items() if k in col_names))
        if key in seen:
            duplicate_count += 1
        seen.add(key)

    uniqueness = (len(rows) - duplicate_count) / len(rows) * 100 if rows else 0

    # --- Consistency: numeric columns should have numeric values ---
    format_issues = 0
    numeric_types = {"integer", "int", "float", "number", "numeric", "decimal", "bigint"}
    for col in columns:
        if col.get("data_type", "").lower() in numeric_types:
            col_name = col["name"]
            for row in rows:
                val = row.get(col_name)
                if val is not None:
                    try:
                        float(str(val))
                    except (ValueError, TypeError):
                        format_issues += 1

    consistency = max(0, 100 - (format_issues / max(total_cells, 1) * 100))

    overall = round((completeness + uniqueness + consistency) / 3, 1)

    return {
        "overall_score": overall,
        "completeness": round(completeness, 1),
        "uniqueness": round(uniqueness, 1),
        "consistency": round(consistency, 1),
        "null_count": null_count,
        "duplicate_count": duplicate_count,
        "format_issues": format_issues,
        "total_rows": len(rows),
        "total_columns": len(col_names),
    }
