"""File-based connector for CSV, Excel, JSON, and fixed-width uploads."""

import json
from pathlib import Path
from typing import Any

import pandas as pd

from app.connectors.base import BaseConnector

# Map pandas dtype names to human-friendly type strings
_DTYPE_MAP: dict[str, str] = {
    "int64": "integer",
    "Int64": "integer",
    "float64": "float",
    "Float64": "float",
    "object": "string",
    "string": "string",
    "bool": "boolean",
    "boolean": "boolean",
    "datetime64[ns]": "datetime",
    "datetime64[ns, UTC]": "datetime",
}


class FileConnector(BaseConnector):
    """Connector that reads CSV, Excel, JSON, and fixed-width files into a DataFrame.

    Automatically detects column types and provides schema metadata.
    """

    SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".json", ".txt", ".dat"}

    def __init__(self, file_path: str) -> None:
        self.file_path = Path(file_path)
        self._df: pd.DataFrame | None = None

    async def connect(self) -> None:
        """Validate that the file exists and has a supported extension."""
        if not self.file_path.exists():
            raise FileNotFoundError(f"File not found: {self.file_path}")

        if self.file_path.suffix.lower() not in self.SUPPORTED_EXTENSIONS:
            raise ValueError(
                f"Unsupported file type '{self.file_path.suffix}'. "
                f"Supported: {', '.join(sorted(self.SUPPORTED_EXTENSIONS))}"
            )

    def _read_json(self) -> pd.DataFrame:
        """Read a JSON file, detecting whether it is an array of objects or nested."""
        with open(self.file_path, "r", encoding="utf-8") as f:
            raw = json.load(f)

        if isinstance(raw, list):
            # Array of objects — the most common tabular format
            return pd.DataFrame(raw)
        elif isinstance(raw, dict):
            # Could be a single object or nested structure.
            # Try pd.json_normalize for nested dicts, fall back to wrapping in a list.
            try:
                return pd.json_normalize(raw)
            except Exception:
                return pd.DataFrame([raw])
        else:
            raise ValueError(
                "JSON file must contain an array of objects or a JSON object."
            )

    async def fetch_data(self) -> pd.DataFrame:
        """Parse the file and return its contents as a DataFrame."""
        await self.connect()

        suffix = self.file_path.suffix.lower()
        if suffix == ".csv":
            self._df = pd.read_csv(self.file_path)
        elif suffix in {".xlsx", ".xls"}:
            self._df = pd.read_excel(self.file_path)
        elif suffix == ".json":
            self._df = self._read_json()
        elif suffix in {".txt", ".dat"}:
            # Fixed-width format
            self._df = pd.read_fwf(self.file_path)
        else:
            raise ValueError(f"Unsupported file type: {suffix}")

        # Attempt to auto-detect better types (dates, numbers stored as strings)
        self._df = self._df.convert_dtypes()
        return self._df

    async def get_schema(self) -> list[dict[str, Any]]:
        """Return column definitions derived from the DataFrame.

        If ``fetch_data`` has not been called yet, it will be invoked first.
        """
        if self._df is None:
            await self.fetch_data()

        assert self._df is not None  # guaranteed by fetch_data

        schema: list[dict[str, Any]] = []
        for position, col_name in enumerate(self._df.columns):
            dtype_str = str(self._df[col_name].dtype)
            friendly_type = _DTYPE_MAP.get(dtype_str, "string")

            schema.append(
                {
                    "name": col_name,
                    "data_type": friendly_type,
                    "ordinal_position": position,
                }
            )

        return schema
