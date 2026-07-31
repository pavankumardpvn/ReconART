"""Redis caching helpers for frequent queries."""

import json
import logging

from app.config import settings

logger = logging.getLogger(__name__)
_redis = None


def _get_redis():
    global _redis
    if _redis is None:
        import redis

        _redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def cache_get(key: str):
    try:
        data = _get_redis().get(key)
        return json.loads(data) if data else None
    except Exception:
        return None


async def cache_set(key: str, value, ttl: int = 60):
    try:
        _get_redis().setex(key, ttl, json.dumps(value, default=str))
    except Exception:
        pass


async def cache_delete(pattern: str):
    try:
        r = _get_redis()
        keys = r.keys(pattern)
        if keys:
            r.delete(*keys)
    except Exception:
        pass
