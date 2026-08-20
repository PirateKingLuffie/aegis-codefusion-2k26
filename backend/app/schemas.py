from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


RecordKind = Literal[
    "incident",
    "scenario",
    "simulation",
    "recommendation",
    "workspace",
    "resource",
]

EvidenceClass = Literal["OBSERVED", "IMPORTED", "ESTIMATED", "SIMULATED"]

GEOMETRY_TYPES = {
    "Point",
    "MultiPoint",
    "LineString",
    "MultiLineString",
    "Polygon",
    "MultiPolygon",
    "GeometryCollection",
}


def _validate_position(value: Any) -> None:
    if not isinstance(value, (list, tuple)) or not 2 <= len(value) <= 3:
        raise ValueError("GeoJSON positions must contain longitude and latitude")
    if any(not isinstance(item, (int, float)) or isinstance(item, bool) for item in value):
        raise ValueError("GeoJSON position values must be numeric")
    if any(not math.isfinite(float(item)) for item in value):
        raise ValueError("GeoJSON position values must be finite")
    longitude, latitude = value[0], value[1]
    if not math.isfinite(float(longitude)) or not math.isfinite(float(latitude)):
        raise ValueError("GeoJSON coordinates must be finite")
    if not (-180 <= float(longitude) <= 180 and -90 <= float(latitude) <= 90):
        raise ValueError("GeoJSON coordinates must be inside WGS84 bounds")


def _coordinate_array(value: Any, *, minimum: int, label: str) -> list[Any] | tuple[Any, ...]:
    if not isinstance(value, (list, tuple)) or len(value) < minimum:
        raise ValueError(f"GeoJSON {label} needs at least {minimum} entries")
    return value


def _validate_line(value: Any, *, minimum: int = 2) -> None:
    for position in _coordinate_array(value, minimum=minimum, label="line"):
        _validate_position(position)


def _validate_polygon(value: Any) -> None:
    rings = _coordinate_array(value, minimum=1, label="polygon")
    for ring in rings:
        positions = _coordinate_array(ring, minimum=4, label="linear ring")
        _validate_line(positions, minimum=4)
        if list(positions[0]) != list(positions[-1]):
            raise ValueError("GeoJSON polygon rings must be closed")


def validate_geometry(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if value is None:
        return None
    geometry_type = value.get("type")
    if geometry_type not in GEOMETRY_TYPES:
        raise ValueError("geometry must be a GeoJSON geometry object, not a Feature")
    if "crs" in value:
        raise ValueError("GeoJSON geometry must use WGS84 and cannot declare a custom CRS")
    if geometry_type == "GeometryCollection":
        geometries = value.get("geometries")
        if not isinstance(geometries, list) or not geometries:
            raise ValueError("GeometryCollection must contain at least one geometry")
        for geometry in geometries:
            if not isinstance(geometry, dict):
                raise ValueError("GeometryCollection entries must be geometry objects")
            validate_geometry(geometry)
        return value
    coordinates = value.get("coordinates")
    if geometry_type == "Point":
        _validate_position(coordinates)
    elif geometry_type == "MultiPoint":
        for position in _coordinate_array(coordinates, minimum=1, label="multipoint"):
            _validate_position(position)
    elif geometry_type == "LineString":
        _validate_line(coordinates)
    elif geometry_type == "MultiLineString":
        for line in _coordinate_array(coordinates, minimum=1, label="multiline"):
            _validate_line(line)
    elif geometry_type == "Polygon":
        _validate_polygon(coordinates)
    elif geometry_type == "MultiPolygon":
        for polygon in _coordinate_array(coordinates, minimum=1, label="multipolygon"):
            _validate_polygon(polygon)
    return value


def validate_json_value(value: Any, depth: int = 0) -> Any:
    if depth > 64:
        raise ValueError("JSON payload nesting exceeds 64 levels")
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("JSON payload numbers must be finite")
        return value
    if isinstance(value, list):
        for item in value:
            validate_json_value(item, depth + 1)
        return value
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError("JSON payload object keys must be strings")
            validate_json_value(item, depth + 1)
        return value
    raise ValueError("payload must contain only JSON-compatible values")


class RecordCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: str | None = Field(default=None, min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")
    kind: RecordKind
    name: str = Field(min_length=1, max_length=180)
    status: str = Field(default="draft", min_length=1, max_length=48)
    seed: str | None = Field(default=None, max_length=180)
    geometry: dict[str, Any] | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    actor: str = Field(default="operator", min_length=1, max_length=64)

    @field_validator("geometry")
    @classmethod
    def geometry_is_wgs84(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return validate_geometry(value)

    @field_validator("payload")
    @classmethod
    def payload_is_json(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_json_value(value)


class RecordUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    expected_version: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=180)
    status: str | None = Field(default=None, min_length=1, max_length=48)
    seed: str | None = Field(default=None, max_length=180)
    geometry: dict[str, Any] | None = None
    payload: dict[str, Any] | None = None
    actor: str = Field(default="operator", min_length=1, max_length=64)

    @field_validator("geometry")
    @classmethod
    def geometry_is_wgs84(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return validate_geometry(value)

    @field_validator("payload")
    @classmethod
    def payload_is_json(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return validate_json_value(value)


class RecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    name: str
    status: str
    seed: str | None
    version: int
    geometry: dict[str, Any] | None
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class RevisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    version: int
    payload: dict[str, Any]
    geometry: dict[str, Any] | None
    created_at: datetime
    actor: str


class AuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sequence: int
    event_id: str
    record_id: str | None
    record_kind: str | None
    event_type: str
    source_class: str
    actor: str
    occurred_at: datetime
    payload: dict[str, Any]
    previous_hash: str | None
    event_hash: str


class AuditReceipt(BaseModel):
    from_sequence: int
    to_sequence: int
    event_count: int
    terminal_hash: str | None
    chain_valid: bool


class EventQuery(BaseModel):
    after: int = Field(default=0, ge=0)
    limit: int = Field(default=200, ge=1, le=1000)

    @field_validator("after", "limit", mode="before")
    @classmethod
    def parse_integer(cls, value: Any) -> int:
        return int(value)


class SpatialAssetCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: str = Field(min_length=3, max_length=120, pattern=r"^[A-Za-z0-9._:-]+$")
    asset_type: str = Field(min_length=2, max_length=64, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=1, max_length=240)
    evidence_class: EvidenceClass
    geometry: dict[str, Any]
    properties: dict[str, Any] = Field(default_factory=dict)
    source_url: str | None = Field(default=None, max_length=1000)
    observed_at: datetime | None = None
    actor: str = Field(default="operator", min_length=1, max_length=64)

    @field_validator("geometry")
    @classmethod
    def geometry_is_wgs84(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_geometry(value)  # type: ignore[return-value]

    @field_validator("source_url")
    @classmethod
    def source_is_http(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(("https://", "http://")):
            raise ValueError("source_url must use http or https")
        return value

    @field_validator("observed_at")
    @classmethod
    def observation_has_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.utcoffset() is None:
            raise ValueError("observed_at must include a timezone offset")
        return value

    @field_validator("properties")
    @classmethod
    def properties_are_json(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_json_value(value)


class SpatialAssetResponse(BaseModel):
    id: str
    asset_type: str
    name: str
    evidence_class: EvidenceClass
    geometry: dict[str, Any]
    properties: dict[str, Any]
    source_url: str | None
    observed_at: datetime | None
    updated_at: datetime
