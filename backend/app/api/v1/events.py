"""SSE endpoint for real-time event streaming via Redis pub/sub."""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, Request
from sse_starlette.sse import EventSourceResponse

from app.dependencies import get_current_tenant, get_current_user
from app.models.tenant import Tenant
from app.services.cache_service import _get_redis

logger = logging.getLogger(__name__)

router = APIRouter()


async def _event_generator(request: Request, tenant_id: str):
    r = _get_redis()
    pubsub = r.pubsub()
    channel = f"events:{tenant_id}"
    pubsub.subscribe(channel)

    try:
        yield {"event": "connected", "data": json.dumps({"channel": channel})}

        while True:
            if await request.is_disconnected():
                break

            message = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message["type"] == "message":
                payload = json.loads(message["data"])
                yield {
                    "event": payload.get("event", "message"),
                    "data": json.dumps(payload.get("data", {})),
                }
            else:
                await asyncio.sleep(0.5)
    finally:
        pubsub.unsubscribe(channel)
        pubsub.close()


@router.get("/stream")
async def event_stream(
    request: Request,
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    return EventSourceResponse(_event_generator(request, str(tenant.id)))
