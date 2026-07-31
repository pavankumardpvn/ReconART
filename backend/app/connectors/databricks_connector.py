"""Databricks / Delta Lake connector.

Connects to a Databricks workspace and queries Delta tables.
Uses the open-source ``databricks-sql-connector`` package (free, no license cost).

Install: pip install databricks-sql-connector
"""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from app.connectors.base import BaseConnector

logger = logging.getLogger(__name__)


class DatabricksConnector(BaseConnector):

    def __init__(self, connection_config: dict[str, Any]) -> None:
        self.config = connection_config
        self._df: pd.DataFrame | None = None

    async def connect(self) -> None:
        try:
            from databricks import sql as dbsql  # noqa: F401
        except ImportError:
            raise RuntimeError(
                "databricks-sql-connector is not installed. "
                "Install it with: pip install databricks-sql-connector"
            )

        required = ("server_hostname", "http_path", "access_token")
        for key in required:
            if not self.config.get(key):
                raise ValueError(f"Missing required Databricks config: {key}")

    async def fetch_data(self) -> pd.DataFrame:
        await self.connect()

        from databricks import sql as dbsql

        query = self.config.get("query", "SELECT 1")
        catalog = self.config.get("catalog")
        schema = self.config.get("schema")

        connection = dbsql.connect(
            server_hostname=self.config["server_hostname"],
            http_path=self.config["http_path"],
            access_token=self.config["access_token"],
            catalog=catalog,
            schema=schema,
        )

        try:
            cursor = connection.cursor()
            cursor.execute(query)
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            self._df = pd.DataFrame(rows, columns=columns)
            cursor.close()
        finally:
            connection.close()

        return self._df

    async def get_schema(self) -> list[dict[str, Any]]:
        if self._df is None:
            await self.fetch_data()

        assert self._df is not None

        schema = []
        for position, col_name in enumerate(self._df.columns):
            dtype_str = str(self._df[col_name].dtype)
            friendly_type = "string"
            if "int" in dtype_str:
                friendly_type = "integer"
            elif "float" in dtype_str:
                friendly_type = "float"
            elif "datetime" in dtype_str:
                friendly_type = "datetime"
            elif "bool" in dtype_str:
                friendly_type = "boolean"

            schema.append({
                "name": col_name,
                "data_type": friendly_type,
                "ordinal_position": position,
            })

        return schema
