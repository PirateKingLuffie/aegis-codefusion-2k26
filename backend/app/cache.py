from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from redis import Redis
from redis.exceptions import RedisError

from .config import get_settings


@lru_cache
def client() -> Redis | None:
    url = get_settings().redis_url
    if not url:
        return None
    try:
        return Redis.from_url(url, decode_responses=True, socket_connect_timeout=0.6, socket_timeout=0.8)
    except (ValueError, RedisError):
        return None


def status() -> str:
    connection = client()
    if connection is None:
        return "degraded" if get_settings().redis_url else "disabled"
    try:
        return "ready" if connection.ping() else "degraded"
    except RedisError:
        return "degraded"


def get_json(key: str) -> Any | None:
    connection = client()
    if connection is None:
        return None
    try:
        value = connection.get(key)
        return json.loads(value) if value else None
    except (RedisError, json.JSONDecodeError):
        return None


def put_json(key: str, value: Any, ttl_seconds: int = 30) -> None:
    connection = client()
    if connection is None:
        return
    try:
        connection.setex(key, ttl_seconds, json.dumps(value, default=str, separators=(",", ":")))
    except (RedisError, TypeError, ValueError):
        return


def invalidate_records() -> None:
    connection = client()
    if connection is None:
        return
    try:
        keys = list(connection.scan_iter(match="aegis:records:*", count=100))
        if keys:
            connection.delete(*keys)
    except RedisError:
        return
