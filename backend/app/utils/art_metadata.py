"""ART system metadata — auto-injected columns for every data row."""

import uuid
from datetime import datetime, timezone

ART_SYSTEM_COLUMNS = [
    {"name": "art_id", "display_name": "ART ID", "data_type": "string", "ordinal_position": -6},
    {"name": "art_created_at", "display_name": "ART Created At", "data_type": "datetime", "ordinal_position": -5},
    {"name": "art_created_date", "display_name": "ART Created Date", "data_type": "date", "ordinal_position": -4},
    {"name": "art_file_id", "display_name": "File ID", "data_type": "string", "ordinal_position": -3},
    {"name": "art_file_name", "display_name": "File Name", "data_type": "string", "ordinal_position": -2},
    {"name": "art_row_number", "display_name": "File Row #", "data_type": "integer", "ordinal_position": -1},
]


def inject_art_metadata(
    row_data: dict,
    row_number: int,
    *,
    file_id: str | None = None,
    file_name: str | None = None,
) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "art_id": f"ART_{uuid.uuid4().hex[:8].upper()}",
        "art_created_at": now.isoformat(),
        "art_created_date": now.strftime("%Y-%m-%d"),
        "art_file_id": file_id,
        "art_file_name": file_name,
        "art_row_number": row_number,
        **row_data,
    }
