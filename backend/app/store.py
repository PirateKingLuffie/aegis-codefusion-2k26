from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import AuditEvent, Record, RecordRevision
from .schemas import RecordCreate, RecordUpdate, SpatialAssetCreate


class RecordNotFoundError(LookupError):
    pass


class VersionConflictError(RuntimeError):
    def __init__(self, current_version: int):
        super().__init__(f"Record changed; current version is {current_version}")
        self.current_version = current_version


class InvalidSpatialGeometryError(ValueError):
    pass


def _canonical_json(value: dict[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str)


def _utc_iso(value: datetime) -> str:
    aware = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    return aware.astimezone(UTC).isoformat()


def _append_audit(
    session: Session,
    *,
    event_type: str,
    record: Record | None,
    actor: str,
    payload: dict[str, Any],
    source_class: str = "OPERATOR",
) -> AuditEvent:
    # The transaction-scoped lock prevents two API workers from forking the
    # hash chain when they append at the same time. SQLite deployments use one
    # local API process and obtain a database write lock on flush.
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(1040067135)"))
    previous = session.scalar(select(AuditEvent).order_by(AuditEvent.sequence.desc()).limit(1))
    previous_hash = previous.event_hash if previous else None
    event_id = str(uuid.uuid4())
    occurred_at = datetime.now(UTC)
    content = {
        "event_id": event_id,
        "record_id": record.id if record else None,
        "record_kind": record.kind if record else None,
        "event_type": event_type,
        "source_class": source_class,
        "actor": actor,
        "occurred_at": occurred_at.isoformat(),
        "payload": payload,
        "previous_hash": previous_hash,
    }
    event_hash = hashlib.sha256(_canonical_json(content).encode("utf-8")).hexdigest()
    event = AuditEvent(
        event_id=event_id,
        record_id=record.id if record else None,
        record_kind=record.kind if record else None,
        event_type=event_type,
        source_class=source_class,
        actor=actor,
        occurred_at=occurred_at,
        payload=payload,
        previous_hash=previous_hash,
        event_hash=event_hash,
    )
    session.add(event)
    session.flush()
    return event


def list_records(session: Session, *, kind: str | None, limit: int, offset: int) -> list[Record]:
    statement = select(Record).order_by(Record.updated_at.desc()).limit(limit).offset(offset)
    if kind:
        statement = statement.where(Record.kind == kind)
    return list(session.scalars(statement))


def get_record(session: Session, record_id: str) -> Record:
    record = session.get(Record, record_id)
    if record is None:
        raise RecordNotFoundError(record_id)
    return record


def create_record(session: Session, body: RecordCreate) -> Record:
    record_id = body.id or f"{body.kind}-{uuid.uuid4()}"
    existing = session.get(Record, record_id)
    if existing is not None:
        raise VersionConflictError(existing.version)
    record = Record(
        id=record_id,
        kind=body.kind,
        name=body.name,
        status=body.status,
        seed=body.seed,
        version=1,
        geometry=body.geometry,
        payload=body.payload,
    )
    session.add(record)
    try:
        session.flush()
    except IntegrityError as exc:
        raise VersionConflictError(1) from exc
    session.add(
        RecordRevision(
            record_id=record.id,
            version=1,
            payload=record.payload,
            geometry=record.geometry,
            actor=body.actor,
        )
    )
    _append_audit(
        session,
        event_type=f"{record.kind}.created",
        record=record,
        actor=body.actor,
        payload={"version": 1, "name": record.name, "status": record.status, "seed": record.seed},
    )
    session.flush()
    return record


def update_record(session: Session, record_id: str, body: RecordUpdate) -> Record:
    record = session.scalar(select(Record).where(Record.id == record_id).with_for_update())
    if record is None:
        raise RecordNotFoundError(record_id)
    if record.version != body.expected_version:
        raise VersionConflictError(record.version)
    changed: list[str] = []
    for field in ("name", "status", "seed", "geometry", "payload"):
        if field not in body.model_fields_set:
            continue
        value = getattr(body, field)
        if field in {"name", "status", "payload"} and value is None:
            continue
        if value != getattr(record, field):
            setattr(record, field, value)
            changed.append(field)
    if not changed:
        return record
    record.version += 1
    record.updated_at = datetime.now(UTC)
    session.add(
        RecordRevision(
            record_id=record.id,
            version=record.version,
            payload=record.payload,
            geometry=record.geometry,
            actor=body.actor,
        )
    )
    _append_audit(
        session,
        event_type=f"{record.kind}.updated",
        record=record,
        actor=body.actor,
        payload={"version": record.version, "changed": changed, "status": record.status},
    )
    session.flush()
    return record


def list_revisions(session: Session, record_id: str) -> list[RecordRevision]:
    get_record(session, record_id)
    return list(
        session.scalars(
            select(RecordRevision)
            .where(RecordRevision.record_id == record_id)
            .order_by(RecordRevision.version.desc())
        )
    )


def list_events(session: Session, *, after: int, limit: int) -> list[AuditEvent]:
    return list(
        session.scalars(
            select(AuditEvent)
            .where(AuditEvent.sequence > after)
            .order_by(AuditEvent.sequence.asc())
            .limit(limit)
        )
    )


def audit_receipt(session: Session, *, after: int = 0) -> dict[str, Any]:
    prior = session.scalar(
        select(AuditEvent)
        .where(AuditEvent.sequence <= after)
        .order_by(AuditEvent.sequence.desc())
        .limit(1)
    ) if after > 0 else None
    previous_hash: str | None = prior.event_hash if prior else None
    chain_valid = True
    first_sequence: int | None = None
    last_sequence = after
    terminal_hash = previous_hash
    event_count = 0
    statement = (
        select(AuditEvent)
        .where(AuditEvent.sequence > after)
        .order_by(AuditEvent.sequence.asc())
        .execution_options(yield_per=1_000)
    )
    for event in session.scalars(statement):
        if first_sequence is None:
            first_sequence = event.sequence
        event_count += 1
        last_sequence = event.sequence
        if event.previous_hash != previous_hash:
            chain_valid = False
            break
        content = {
            "event_id": event.event_id,
            "record_id": event.record_id,
            "record_kind": event.record_kind,
            "event_type": event.event_type,
            "source_class": event.source_class,
            "actor": event.actor,
            "occurred_at": _utc_iso(event.occurred_at),
            "payload": event.payload,
            "previous_hash": event.previous_hash,
        }
        expected = hashlib.sha256(_canonical_json(content).encode("utf-8")).hexdigest()
        if expected != event.event_hash:
            chain_valid = False
            break
        previous_hash = event.event_hash
        terminal_hash = event.event_hash
    return {
        "from_sequence": first_sequence if first_sequence is not None else after,
        "to_sequence": last_sequence,
        "event_count": event_count,
        "terminal_hash": terminal_hash,
        "chain_valid": chain_valid,
    }


def latest_event(session: Session, *, record_id: str | None = None) -> AuditEvent | None:
    statement = select(AuditEvent).order_by(AuditEvent.sequence.desc()).limit(1)
    if record_id is not None:
        statement = statement.where(AuditEvent.record_id == record_id)
    return session.scalar(statement)


def count_records(session: Session) -> dict[str, int]:
    rows = session.execute(select(Record.kind, func.count(Record.id)).group_by(Record.kind)).all()
    return {str(kind): int(count) for kind, count in rows}


def append_audit_event(
    session: Session,
    *,
    event_type: str,
    actor: str,
    payload: dict[str, Any],
    source_class: str,
) -> AuditEvent:
    return _append_audit(
        session,
        event_type=event_type,
        record=None,
        actor=actor,
        payload=payload,
        source_class=source_class,
    )


def upsert_spatial_asset(session: Session, body: SpatialAssetCreate) -> dict[str, Any]:
    if session.bind is None or session.bind.dialect.name != "postgresql":
        raise RuntimeError("Spatial assets require the deployed PostGIS database.")
    geometry_json = json.dumps(body.geometry, separators=(",", ":"))
    validity = session.execute(text("""
        SELECT ST_IsValid(candidate) AS valid, ST_IsValidReason(candidate) AS reason
        FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326) AS candidate) parsed
    """), {"geometry": geometry_json}).mappings().one()
    if not validity["valid"]:
        raise InvalidSpatialGeometryError(str(validity["reason"]))
    row = session.execute(text("""
        INSERT INTO geospatial_assets (
          id, asset_type, name, evidence_class, geom, properties, source_url, observed_at, updated_at
        ) VALUES (
          :id, :asset_type, :name, :evidence_class,
          ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326),
          CAST(:properties AS jsonb), :source_url, :observed_at, now()
        )
        ON CONFLICT (id) DO UPDATE SET
          asset_type = EXCLUDED.asset_type,
          name = EXCLUDED.name,
          evidence_class = EXCLUDED.evidence_class,
          geom = EXCLUDED.geom,
          properties = EXCLUDED.properties,
          source_url = EXCLUDED.source_url,
          observed_at = EXCLUDED.observed_at,
          updated_at = now()
        RETURNING id, asset_type, name, evidence_class,
          ST_AsGeoJSON(geom)::json AS geometry, properties, source_url, observed_at, updated_at
    """), {
        "id": body.id,
        "asset_type": body.asset_type,
        "name": body.name,
        "evidence_class": body.evidence_class,
        "geometry": geometry_json,
        "properties": json.dumps(body.properties, separators=(",", ":")),
        "source_url": body.source_url,
        "observed_at": body.observed_at,
    }).mappings().one()
    append_audit_event(
        session,
        event_type="spatial-asset.upserted",
        actor=body.actor,
        payload={"id": body.id, "assetType": body.asset_type, "evidenceClass": body.evidence_class},
        source_class=body.evidence_class,
    )
    return dict(row)


def list_spatial_assets(
    session: Session,
    *,
    bbox: tuple[float, float, float, float] | None,
    asset_type: str | None,
    limit: int,
) -> list[dict[str, Any]]:
    if session.bind is None or session.bind.dialect.name != "postgresql":
        raise RuntimeError("Spatial assets require the deployed PostGIS database.")
    clauses = ["1 = 1"]
    parameters: dict[str, Any] = {"limit": limit}
    if asset_type:
        clauses.append("asset_type = :asset_type")
        parameters["asset_type"] = asset_type
    if bbox:
        west, south, east, north = bbox
        clauses.append("ST_Intersects(geom, ST_MakeEnvelope(:west, :south, :east, :north, 4326))")
        parameters.update({"west": west, "south": south, "east": east, "north": north})
    rows = session.execute(text(f"""
        SELECT id, asset_type, name, evidence_class,
          ST_AsGeoJSON(geom)::json AS geometry, properties, source_url, observed_at, updated_at
        FROM geospatial_assets
        WHERE {' AND '.join(clauses)}
        ORDER BY updated_at DESC
        LIMIT :limit
    """), parameters).mappings().all()
    return [dict(row) for row in rows]
