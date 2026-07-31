"""Abstract base connector for data ingestion."""

from abc import ABC, abstractmethod
from typing import Any

import pandas as pd


class BaseConnector(ABC):
    """Interface that all data connectors (file, database, API) must implement.

    A connector is responsible for establishing a connection to a data source,
    fetching its rows as a pandas DataFrame, and describing the schema.
    """

    @abstractmethod
    async def connect(self) -> None:
        """Establish or validate the connection to the data source.

        Raises:
            ConnectionError: If the source is unreachable or credentials are invalid.
        """

    @abstractmethod
    async def fetch_data(self) -> pd.DataFrame:
        """Retrieve data from the source and return it as a DataFrame.

        Returns:
            A ``pandas.DataFrame`` with the full dataset (or the requested
            subset, depending on connector configuration).
        """

    @abstractmethod
    async def get_schema(self) -> list[dict[str, Any]]:
        """Return column definitions for the data source.

        Each dict should contain at minimum:
            - ``name`` (str): Column name.
            - ``data_type`` (str): Detected or declared data type.
            - ``ordinal_position`` (int): 0-based column index.

        Returns:
            A list of column-definition dicts.
        """
