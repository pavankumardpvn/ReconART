"""File-based connector for CSV, Excel, JSON, and fixed-width uploads."""

import io
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

    def __init__(self, file_path: str | None = None, *, content: bytes | None = None, filename: str | None = None) -> None:
        self.file_path = Path(file_path) if file_path else None
        self._content = content
        self._filename = filename
        self._df: pd.DataFrame | None = None

    def _suffix(self) -> str:
        if self._content is not None and self._filename:
            return Path(self._filename).suffix.lower()
        if self.file_path:
            return self.file_path.suffix.lower()
        raise ValueError("No file path or content provided.")

    async def connect(self) -> None:
        """Validate that the file exists and has a supported extension."""
        if self._content is not None:
            suffix = self._suffix()
            if suffix not in self.SUPPORTED_EXTENSIONS:
                raise ValueError(
                    f"Unsupported file type '{suffix}'. "
                    f"Supported: {', '.join(sorted(self.SUPPORTED_EXTENSIONS))}"
                )
            return

        if not self.file_path or not self.file_path.exists():
            raise FileNotFoundError(f"File not found: {self.file_path}")

        if self.file_path.suffix.lower() not in self.SUPPORTED_EXTENSIONS:
            raise ValueError(
                f"Unsupported file type '{self.file_path.suffix}'. "
                f"Supported: {', '.join(sorted(self.SUPPORTED_EXTENSIONS))}"
            )

    def _read_json(self, source: Any = None) -> pd.DataFrame:
        """Read a JSON file, detecting whether it is an array of objects or nested."""
        if source is None:
            source = self.file_path
        if isinstance(source, io.BytesIO):
            raw = json.loads(source.read().decode("utf-8"))
        else:
            with open(source, "r", encoding="utf-8") as f:
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

        suffix = self._suffix()
        source = io.BytesIO(self._content) if self._content is not None else self.file_path

        if suffix == ".csv":
            self._df = pd.read_csv(source)
        elif suffix in {".xlsx", ".xls"}:
            self._df = pd.read_excel(source)
        elif suffix == ".json":
            self._df = self._read_json(source)
        elif suffix in {".txt", ".dat"}:
            self._df = pd.read_fwf(source)
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
