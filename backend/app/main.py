from __future__ import annotations

import json
import logging
import re
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from typing import Annotated, Any, AsyncIterator

from fastapi import FastAPI, HTTPException, Path as ApiPath, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .cache import get_json as cache_get_json, invalidate_records, put_json as cache_put_json, status as cache_status
from .config import get_settings
from .database import engine, initialise_database, session_scope
from .events import hub
from .schemas import (
    AuditEventResponse,
    AuditReceipt,
    RecordCreate,
    RecordKind,
    RecordResponse,
    RecordUpdate,
    RevisionResponse,
    SpatialAssetCreate,
    SpatialAssetResponse,
)
from .store import (
    InvalidSpatialGeometryError,
    RecordNotFoundError,
    VersionConflictError,
    audit_receipt,
    count_records,
    create_record,
    get_record,
    latest_event,
    list_events,
    list_records,
    list_revisions,
    list_spatial_assets,
    upsert_spatial_asset,
    update_record,
)


settings = get_settings()
logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("aegis.api")


class SlidingWindowRateLimiter:
    def __init__(self, limit: int, window_seconds: int = 60) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.events: dict[str, deque[float]] = defaultdict(deque)
        self._last_cleanup = 0.0

    def allow(self, key: str, now: float) -> tuple[bool, int]:
        if now - self._last_cleanup >= self.window_seconds:
            cutoff = now - self.window_seconds
            stale = [candidate for candidate, events in self.events.items() if not events or events[-1] <= cutoff]
            for candidate in stale:
                self.events.pop(candidate, None)
            self._last_cleanup = now
        queue = self.events[key]
        cutoff = now - self.window_seconds
        while queue and queue[0] <= cutoff:
            queue.popleft()
        if len(queue) >= self.limit:
            retry_after = max(1, int(self.window_seconds - (now - queue[0])))
            return False, retry_after
        queue.append(now)
        return True, 0


rate_limiter = SlidingWindowRateLimiter(settings.rate_limit_per_minute)
websocket_message_limiter = SlidingWindowRateLimiter(120, window_seconds=60)
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,96}$")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    initialise_database()
    logger.info("AEGIS persistence ready (%s)", engine.url.render_as_string(hide_password=True))
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Versioned operational records, spatial assets and replayable decision receipts for AEGIS.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "X-Request-ID"],
)


def error_response(request_id: str, status: int, code: str, message: str, details: Any = None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=jsonable_encoder({
            "error": {"code": code, "message": message, "details": details},
            "requestId": request_id,
        }),
        headers={"X-Request-ID": request_id, "Cache-Control": "no-store"},
    )


def request_id_from(request: Request) -> str:
    candidate = request.headers.get("X-Request-ID", "")
    return candidate if REQUEST_ID_PATTERN.fullmatch(candidate) else str(uuid.uuid4())


@app.middleware("http")
async def operational_guardrails(request: Request, call_next):  # type: ignore[no-untyped-def]
    request_id = request_id_from(request)
    request.state.request_id = request_id
    client = request.client.host if request.client else "unknown"
    if request.url.path.startswith("/api/"):
        allowed, retry_after = rate_limiter.allow(client, time.monotonic())
        if not allowed:
            response = error_response(request_id, 429, "RATE_LIMITED", "Request limit reached; retry shortly.")
            response.headers["Retry-After"] = str(retry_after)
            return response
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            declared_size = int(content_length)
        except ValueError:
            return error_response(request_id, 400, "INVALID_CONTENT_LENGTH", "Content-Length must be an integer.")
        if declared_size < 0:
            return error_response(request_id, 400, "INVALID_CONTENT_LENGTH", "Content-Length cannot be negative.")
        if declared_size > settings.max_payload_bytes:
            return error_response(request_id, 413, "PAYLOAD_TOO_LARGE", "Request body exceeds the configured limit.")
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("unhandled request failure request_id=%s path=%s", request_id, request.url.path)
        return error_response(request_id, 500, "INTERNAL_ERROR", "The operation could not be completed.")
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-Response-Time-Ms"] = f"{(time.perf_counter() - started) * 1000:.1f}"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    return error_response(request_id, 422, "VALIDATION_ERROR", "Request validation failed.", exc.errors())


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    message = exc.detail if isinstance(exc.detail, str) else "The request could not be completed."
    details = None if isinstance(exc.detail, str) else exc.detail
    return error_response(request_id, exc.status_code, f"HTTP_{exc.status_code}", message, details)


@app.exception_handler(RecordNotFoundError)
async def missing_record(request: Request, _: RecordNotFoundError) -> JSONResponse:
    return error_response(request.state.request_id, 404, "NOT_FOUND", "The requested record does not exist.")


@app.exception_handler(VersionConflictError)
async def version_conflict(request: Request, exc: VersionConflictError) -> JSONResponse:
    return error_response(
        request.state.request_id,
        409,
        "VERSION_CONFLICT",
        "The record changed after it was loaded.",
        {"currentVersion": exc.current_version},
    )


@app.exception_handler(InvalidSpatialGeometryError)
async def invalid_spatial_geometry(request: Request, exc: InvalidSpatialGeometryError) -> JSONResponse:
    return error_response(
        request.state.request_id,
        422,
        "INVALID_GEOMETRY",
        "The GeoJSON geometry is not spatially valid.",
        {"reason": str(exc)},
    )


@app.exception_handler(SQLAlchemyError)
async def database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    logger.warning(
        "database request failure request_id=%s path=%s error=%s",
        request.state.request_id,
        request.url.path,
        type(exc).__name__,
    )
    return error_response(
        request.state.request_id,
        503,
        "DATABASE_UNAVAILABLE",
        "The persistence service is temporarily unavailable.",
    )


@app.get("/", summary="AEGIS Operations API")
def service_root() -> dict[str, str]:
    """Provide a useful entry point when the operations port is opened directly."""
    return {
        "service": "aegis-operations-api",
        "message": "AEGIS Operations API is running. Open the web application to use AEGIS.",
        "webUi": "http://127.0.0.1:4173/",
        "health": "/health",
        "liveness": "/health/live",
        "docs": "/docs",
        "openapi": "/openapi.json",
    }


@app.get("/health/live")
def liveness() -> dict[str, str]:
    return {"status": "ok", "service": "aegis-operations-api"}


@app.get("/health")
def health() -> dict[str, Any]:
    with session_scope() as session:
        session.execute(text("SELECT 1"))
        counts = count_records(session)
        backend = engine.url.get_backend_name()
        spatial_ready = False
        if backend == "postgresql":
            extension_ready = bool(
                session.scalar(text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')"))
            )
            table_ready = bool(session.scalar(text("SELECT to_regclass('public.geospatial_assets') IS NOT NULL")))
            spatial_ready = extension_ready and table_ready
            if not spatial_ready:
                raise HTTPException(status_code=503, detail="PostGIS schema is not ready")
    return {
        "status": "ok",
        "service": "aegis-operations-api",
        "environment": settings.environment,
        "database": backend,
        "records": counts,
        "websocket": "ready",
        "persistence": "postgresql-durable" if backend == "postgresql" else "sqlite-local",
        "cache": cache_status(),
        "spatial": "postgis-ready" if spatial_ready else "requires-postgis-deployment",
    }


@app.get("/api/v1/records", response_model=list[RecordResponse])
def records(
    kind: RecordKind | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[Any]:
    cache_key = f"aegis:records:{kind or 'all'}:{limit}:{offset}"
    cached = cache_get_json(cache_key)
    if isinstance(cached, list):
        return cached
    with session_scope() as session:
        values = [RecordResponse.model_validate(item).model_dump(mode="json") for item in list_records(session, kind=kind, limit=limit, offset=offset)]
    cache_put_json(cache_key, values, 30)
    return values


@app.post("/api/v1/records", response_model=RecordResponse, status_code=201)
async def add_record(body: RecordCreate) -> Any:
    with session_scope() as session:
        record = create_record(session, body)
        response = RecordResponse.model_validate(record)
        created_event = latest_event(session, record_id=record.id)
    if created_event is not None:
        await hub.broadcast("operations", {"type": "event", "event": AuditEventResponse.model_validate(created_event).model_dump(mode="json")})
    invalidate_records()
    return response


@app.get("/api/v1/records/{record_id}", response_model=RecordResponse)
def record(
    record_id: Annotated[str, ApiPath(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")],
) -> Any:
    with session_scope() as session:
        return get_record(session, record_id)


@app.put("/api/v1/records/{record_id}", response_model=RecordResponse)
async def replace_record(
    record_id: Annotated[str, ApiPath(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")],
    body: RecordUpdate,
) -> Any:
    with session_scope() as session:
        previous_version = get_record(session, record_id).version
        updated = update_record(session, record_id, body)
        response = RecordResponse.model_validate(updated)
        updated_event = latest_event(session, record_id=record_id) if updated.version > previous_version else None
    if updated_event is not None:
        await hub.broadcast("operations", {"type": "event", "event": AuditEventResponse.model_validate(updated_event).model_dump(mode="json")})
        invalidate_records()
    return response


def parse_bbox(value: str | None) -> tuple[float, float, float, float] | None:
    if value is None:
        return None
    try:
        west, south, east, north = (float(item) for item in value.split(","))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="bbox must be west,south,east,north") from None
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise HTTPException(status_code=422, detail="bbox is outside WGS84 bounds")
    return west, south, east, north


@app.get("/api/v1/spatial-assets", response_model=list[SpatialAssetResponse])
def spatial_assets(
    bbox: str | None = None,
    asset_type: str | None = Query(default=None, pattern=r"^[a-z0-9-]{2,64}$"),
    limit: int = Query(default=500, ge=1, le=5_000),
) -> list[Any]:
    try:
        with session_scope() as session:
            return list_spatial_assets(session, bbox=parse_bbox(bbox), asset_type=asset_type, limit=limit)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/v1/spatial-assets", response_model=SpatialAssetResponse, status_code=201)
async def save_spatial_asset(body: SpatialAssetCreate) -> Any:
    try:
        with session_scope() as session:
            value = upsert_spatial_asset(session, body)
            spatial_event = latest_event(session)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if spatial_event is not None:
        await hub.broadcast("operations", {"type": "event", "event": AuditEventResponse.model_validate(spatial_event).model_dump(mode="json")})
    return value


@app.get("/api/v1/records/{record_id}/versions", response_model=list[RevisionResponse])
def versions(
    record_id: Annotated[str, ApiPath(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")],
) -> list[Any]:
    with session_scope() as session:
        return list_revisions(session, record_id)


@app.get("/api/v1/events", response_model=list[AuditEventResponse])
def events(after: int = Query(default=0, ge=0), limit: int = Query(default=200, ge=1, le=1000)) -> list[Any]:
    with session_scope() as session:
        return list_events(session, after=after, limit=limit)


@app.get("/api/v1/audit/receipt", response_model=AuditReceipt)
def receipt(after: int = Query(default=0, ge=0)) -> dict[str, Any]:
    with session_scope() as session:
        return audit_receipt(session, after=after)


@app.websocket("/api/v1/stream")
async def stream(
    websocket: WebSocket,
    after: int = Query(default=0, ge=0),
) -> None:
    origin = websocket.headers.get("origin", "").rstrip("/")
    if origin and "*" not in settings.origins and origin not in settings.origins:
        await websocket.close(code=1008, reason="Origin is not allowed")
        return
    client = websocket.client.host if websocket.client else "unknown"
    allowed, _ = rate_limiter.allow(f"ws:{client}", time.monotonic())
    if not allowed:
        await websocket.close(code=1013, reason="Connection rate limit reached")
        return
    await hub.connect("operations", websocket)
    try:
        with session_scope() as session:
            replay_window = [
                AuditEventResponse.model_validate(item).model_dump(mode="json")
                for item in list_events(session, after=after, limit=settings.websocket_replay_limit + 1)
            ]
            replay = replay_window[: settings.websocket_replay_limit]
        await websocket.send_json(
            {
                "type": "snapshot",
                "after": after,
                "events": replay,
                "lastSequence": replay[-1]["sequence"] if replay else after,
                "truncated": len(replay_window) > settings.websocket_replay_limit,
            }
        )
        while True:
            raw = await websocket.receive_text()
            if len(raw.encode("utf-8")) > min(settings.max_payload_bytes, 64_000):
                await websocket.close(code=1009, reason="Message is too large")
                break
            message_allowed, retry_after = websocket_message_limiter.allow(f"ws-message:{client}", time.monotonic())
            if not message_allowed:
                await websocket.send_json({"type": "error", "code": "RATE_LIMITED", "retryAfter": retry_after})
                continue
            try:
                message = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "code": "INVALID_JSON"})
                continue
            if not isinstance(message, dict):
                await websocket.send_json({"type": "error", "code": "INVALID_MESSAGE"})
                continue
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong", "at": time.time()})
            else:
                await websocket.send_json({"type": "error", "code": "UNSUPPORTED_MESSAGE"})
    except WebSocketDisconnect:
        pass
    except SQLAlchemyError:
        await websocket.send_json({"type": "error", "code": "DATABASE_UNAVAILABLE"})
        await websocket.close(code=1011, reason="Persistence service unavailable")
    finally:
        await hub.disconnect("operations", websocket)
