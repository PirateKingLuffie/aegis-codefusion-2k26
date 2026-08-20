from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class ConnectionHub:
    def __init__(self) -> None:
        self._channels: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, channel: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._channels[channel].add(websocket)

    async def disconnect(self, channel: str, websocket: WebSocket) -> None:
        async with self._lock:
            recipients = self._channels.get(channel)
            if recipients is None:
                return
            recipients.discard(websocket)
            if not recipients:
                self._channels.pop(channel, None)

    async def broadcast(self, channel: str, message: dict[str, Any]) -> None:
        async with self._lock:
            recipients = tuple(self._channels.get(channel, ()))
        async def send(websocket: WebSocket) -> WebSocket | None:
            try:
                await asyncio.wait_for(websocket.send_json(message), timeout=2.0)
                return None
            except Exception:
                return websocket

        failed = [item for item in await asyncio.gather(*(send(item) for item in recipients)) if item]
        if failed:
            async with self._lock:
                for websocket in failed:
                    self._channels[channel].discard(websocket)
                if not self._channels[channel]:
                    self._channels.pop(channel, None)


hub = ConnectionHub()
