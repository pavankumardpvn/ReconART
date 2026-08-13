"""Redis pub/sub event service for real-time SSE streaming."""

import json
import logging
from datetime import datetime, timezone

from app.services.cache_service import _get_redis

logger = logging.getLogger(__name__)


def publish_event(tenant_id: str, event_type: str, data: dict) -> bool:
    try:
        payload = json.dumps({
            "event": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, default=str)
        channel = f"events:{tenant_id}"
        _get_redis().publish(channel, payload)
        logger.info("Published event %s to channel %s", event_type, channel)
        return True
    except Exception:
        logger.warning("Failed to publish event %s", event_type, exc_info=True)
        return False
