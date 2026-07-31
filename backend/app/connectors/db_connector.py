"""Database connector for PostgreSQL and MySQL data sources."""

import logging
from typing import Any

import pandas as pd

from app.connectors.base import BaseConnector

logger = logging.getLogger(__name__)

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

SUPPORTED_DB_TYPES = {"postgresql", "mysql"}


class DatabaseConnector(BaseConnector):
    """Connect to a client's PostgreSQL or MySQL database.

    ``connection_config`` must contain:

    - ``db_type``  -- ``"postgresql"`` or ``"mysql"``
    - ``host``     -- database hostname
    - ``port``     -- database port
    - ``database`` -- database name
    - ``username`` -- login user
    - ``password`` -- login password
    - ``query``    -- (optional) SQL to execute; defaults to ``SELECT 1``
    """

    def __init__(self, connection_config: dict) -> None:
        self.config = connection_config
        self._df: pd.DataFrame | None = None
        self._engine = None

    def _build_url(self) -> str:
        """Build a SQLAlchemy connection URL from the config dict."""
        db_type = self.config["db_type"]
        if db_type not in SUPPORTED_DB_TYPES:
            raise ValueError(
                f"Unsupported db_type '{db_type}'. "
                f"Supported: {', '.join(sorted(SUPPORTED_DB_TYPES))}"
            )

        # Use the appropriate driver
        if db_type == "postgresql":
            driver = "postgresql+psycopg2"
        else:
            driver = "mysql+pymysql"

        user = self.config["username"]
        password = self.config["password"]
        host = self.config["host"]
        port = self.config["port"]
        database = self.config["database"]

        return f"{driver}://{user}:{password}@{host}:{port}/{database}"

    def _get_engine(self):
        """Create (and cache) a SQLAlchemy engine."""
        if self._engine is None:
            from sqlalchemy import create_engine

            self._engine = create_engine(
                self._build_url(),
                pool_pre_ping=True,
                connect_args={"connect_timeout": 10},
            )
        return self._engine

    async def connect(self) -> None:
        """Validate the connection by running ``SELECT 1``."""
        from sqlalchemy import text

        required = {"db_type", "host", "port", "database", "username", "password"}
        missing = required - set(self.config.keys())
        if missing:
            raise ValueError(f"Missing required connection parameters: {', '.join(sorted(missing))}")

        engine = self._get_engine()
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
        except Exception as exc:
            raise ConnectionError(f"Database connection failed: {exc}") from exc

    async def fetch_data(self) -> pd.DataFrame:
        """Run the configured query and return the result as a DataFrame."""
        await self.connect()

        query = self.config.get("query", "SELECT 1")
        engine = self._get_engine()

        try:
            self._df = pd.read_sql(query, engine)
        except Exception as exc:
            raise RuntimeError(f"Query execution failed: {exc}") from exc
        finally:
            engine.dispose()

        self._df = self._df.convert_dtypes()
        return self._df

    async def get_schema(self) -> list[dict[str, Any]]:
        """Return column definitions derived from the DataFrame."""
        if self._df is None:
            await self.fetch_data()

        assert self._df is not None

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
