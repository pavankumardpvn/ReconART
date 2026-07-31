"""Celery tasks for processing uploaded data source files."""

import logging

from app.celery_app import celery

logger = logging.getLogger(__name__)


@celery.task(bind=True, name="tasks.parse_uploaded_file")
def parse_uploaded_file(self, data_source_id: str) -> dict:
    """Parse an uploaded file and persist its schema and row data.

    This is a stub -- parsing logic will be implemented later.

    Args:
        data_source_id: UUID of the data source record.

    Returns:
        A dict with the task result summary.
    """
    logger.info(
        "Parsing file for data_source_id=%s task_id=%s",
        data_source_id,
        self.request.id,
    )
    # TODO: implement file parsing and schema detection
    return {"status": "stub", "data_source_id": data_source_id}
