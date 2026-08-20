from __future__ import annotations

import os
import shutil
import unittest
from pathlib import Path


TEST_DATA = Path(__file__).resolve().parent / ".test-data"
TEST_DATA.mkdir(parents=True, exist_ok=True)
TEST_DATABASE = TEST_DATA / f"aegis-test-{os.getpid()}.db"
os.environ["AEGIS_ENVIRONMENT"] = "test"
os.environ["AEGIS_DATABASE_URL"] = f"sqlite:///{TEST_DATABASE.as_posix()}"
os.environ["AEGIS_REDIS_URL"] = ""

from fastapi.testclient import TestClient
from pydantic import ValidationError
from starlette.websockets import WebSocketDisconnect

from app.database import SessionLocal, engine, initialise_database, session_scope
from app.config import get_settings
from app.main import SlidingWindowRateLimiter, app
from app.schemas import RecordCreate, RecordUpdate, SpatialAssetCreate
from app.store import audit_receipt, create_record, latest_event, list_events, list_revisions, update_record


def tearDownModule() -> None:
    engine.dispose()
    shutil.rmtree(TEST_DATA, ignore_errors=True)


class StoreTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        initialise_database()

    def test_create_update_revision_noop_and_audit_receipt(self) -> None:
        with session_scope() as session:
            record = create_record(
                session,
                RecordCreate(
                    kind="scenario",
                    name="EIT flood rehearsal",
                    seed="stable-seed",
                    geometry={"type": "Point", "coordinates": [77.44, 28.39]},
                    payload={"rainfall": 74},
                ),
            )
            self.assertEqual(record.version, 1)
            updated = update_record(
                session,
                record.id,
                RecordUpdate(
                    expected_version=1,
                    seed=None,
                    geometry=None,
                    payload={"rainfall": 49},
                    actor="operator",
                ),
            )
            self.assertEqual(updated.version, 2)
            self.assertIsNone(updated.seed)
            self.assertIsNone(updated.geometry)
            self.assertEqual(len(list_revisions(session, record.id)), 2)
            event_count = len(list_events(session, after=0, limit=1_000))
            unchanged = update_record(
                session,
                record.id,
                RecordUpdate(expected_version=2, payload={"rainfall": 49}),
            )
            self.assertEqual(unchanged.version, 2)
            self.assertEqual(len(list_events(session, after=0, limit=1_000)), event_count)
            receipt = audit_receipt(session)
            self.assertEqual(receipt["event_count"], event_count)
            self.assertTrue(receipt["chain_valid"])
            first_sequence = list_events(session, after=0, limit=1)[0].sequence
            incremental = audit_receipt(session, after=first_sequence)
            self.assertEqual(incremental["event_count"], event_count - 1)
            self.assertTrue(incremental["chain_valid"])
            self.assertIsNotNone(incremental["terminal_hash"])
            self.assertEqual(latest_event(session, record_id=record.id).event_type, "scenario.updated")  # type: ignore[union-attr]

    def test_audit_receipt_detects_modified_event(self) -> None:
        session = SessionLocal()
        try:
            record = create_record(session, RecordCreate(kind="incident", name="Receipt integrity test"))
            event = latest_event(session, record_id=record.id)
            self.assertIsNotNone(event)
            event.payload = {"tampered": True}  # type: ignore[union-attr]
            session.flush()
            self.assertFalse(audit_receipt(session)["chain_valid"])
        finally:
            session.rollback()
            session.close()

    def test_geometry_and_source_url_validation(self) -> None:
        with self.assertRaises(ValidationError):
            SpatialAssetCreate(
                id="bad-feature",
                asset_type="building",
                name="Bad feature",
                evidence_class="IMPORTED",
                geometry={"type": "Feature", "geometry": {"type": "Point", "coordinates": [0, 0]}},
            )
        with self.assertRaises(ValidationError):
            RecordCreate(
                kind="incident",
                name="Out of bounds",
                geometry={"type": "Point", "coordinates": [181, 28]},
            )
        with self.assertRaises(ValidationError):
            SpatialAssetCreate(
                id="bad-source",
                asset_type="building",
                name="Bad source",
                evidence_class="IMPORTED",
                geometry={"type": "Point", "coordinates": [77.44, 28.39]},
                source_url="javascript:alert(1)",
            )
        with self.assertRaises(ValidationError):
            RecordCreate(
                kind="incident",
                name="Broken line",
                geometry={"type": "LineString", "coordinates": [[77.44, 28.39]]},
            )
        with self.assertRaises(ValidationError):
            SpatialAssetCreate(
                id="naive-time",
                asset_type="building",
                name="Naive timestamp",
                evidence_class="OBSERVED",
                geometry={"type": "Point", "coordinates": [77.44, 28.39]},
                observed_at="2026-08-13T12:00:00",
            )


class ApiTest(unittest.TestCase):
    def test_health_and_structured_errors(self) -> None:
        with TestClient(app) as client:
            root = client.get("/")
            self.assertEqual(root.status_code, 200)
            self.assertEqual(root.json()["service"], "aegis-operations-api")
            self.assertEqual(root.json()["webUi"], "http://127.0.0.1:4173/")
            self.assertEqual(root.json()["health"], "/health")
            self.assertEqual(root.json()["docs"], "/docs")

            health = client.get("/health")
            self.assertEqual(health.status_code, 200)
            self.assertEqual(health.json()["persistence"], "sqlite-local")
            self.assertEqual(client.get("/health/live").status_code, 200)

            missing = client.get("/api/v1/records/not-found")
            self.assertEqual(missing.status_code, 404)
            self.assertEqual(missing.json()["error"]["code"], "NOT_FOUND")
            self.assertTrue(missing.headers["x-request-id"])

            invalid = client.post("/api/v1/records", json={"kind": "unknown", "name": "Invalid"})
            self.assertEqual(invalid.status_code, 422)
            self.assertEqual(invalid.json()["error"]["code"], "VALIDATION_ERROR")

            unknown_route = client.get("/not-a-route")
            self.assertEqual(unknown_route.status_code, 404)
            self.assertEqual(unknown_route.json()["error"]["code"], "HTTP_404")

            local_spatial = client.get("/api/v1/spatial-assets")
            self.assertEqual(local_spatial.status_code, 503)
            self.assertEqual(local_spatial.json()["error"]["code"], "HTTP_503")

            too_large = client.post(
                "/api/v1/records",
                content=b"{}",
                headers={"content-length": str(get_settings().max_payload_bytes + 1)},
            )
            self.assertEqual(too_large.status_code, 413)
            self.assertEqual(too_large.json()["error"]["code"], "PAYLOAD_TOO_LARGE")

            supplied_id = "x" * 120
            sanitized = client.get("/health/live", headers={"X-Request-ID": supplied_id})
            self.assertNotEqual(sanitized.headers["x-request-id"], supplied_id)

    def test_create_update_conflict_and_noop(self) -> None:
        with TestClient(app) as client:
            created = client.post(
                "/api/v1/records",
                json={"id": "api-scenario", "kind": "scenario", "name": "API scenario", "payload": {"minute": 0}},
            )
            self.assertEqual(created.status_code, 201)
            unchanged = client.put(
                "/api/v1/records/api-scenario",
                json={"expected_version": 1, "payload": {"minute": 0}},
            )
            self.assertEqual(unchanged.status_code, 200)
            self.assertEqual(unchanged.json()["version"], 1)
            changed = client.put(
                "/api/v1/records/api-scenario",
                json={"expected_version": 1, "payload": {"minute": 15}},
            )
            self.assertEqual(changed.status_code, 200)
            self.assertEqual(changed.json()["version"], 2)
            conflict = client.put(
                "/api/v1/records/api-scenario",
                json={"expected_version": 1, "payload": {"minute": 20}},
            )
            self.assertEqual(conflict.status_code, 409)
            self.assertEqual(conflict.json()["error"]["details"]["currentVersion"], 2)

            events = client.get("/api/v1/events").json()
            scenario_events = [item for item in events if item["record_id"] == "api-scenario"]
            self.assertEqual([item["event_type"] for item in scenario_events], ["scenario.created", "scenario.updated"])

    def test_websocket_replay_ping_and_origin_guard(self) -> None:
        with TestClient(app) as client:
            with client.websocket_connect(
                "/api/v1/stream?after=0",
                headers={"origin": "http://127.0.0.1:4173"},
            ) as websocket:
                snapshot = websocket.receive_json()
                self.assertEqual(snapshot["type"], "snapshot")
                self.assertIsInstance(snapshot["events"], list)
                websocket.send_json({"type": "ping"})
                self.assertEqual(websocket.receive_json()["type"], "pong")

            with self.assertRaises(WebSocketDisconnect):
                with client.websocket_connect(
                    "/api/v1/stream?after=0",
                    headers={"origin": "https://untrusted.example"},
                ):
                    pass

    def test_sliding_window_rate_limit(self) -> None:
        limiter = SlidingWindowRateLimiter(limit=2, window_seconds=10)
        self.assertEqual(limiter.allow("operator", 1), (True, 0))
        self.assertEqual(limiter.allow("operator", 2), (True, 0))
        allowed, retry_after = limiter.allow("operator", 3)
        self.assertFalse(allowed)
        self.assertGreater(retry_after, 0)
        self.assertEqual(limiter.allow("operator", 12), (True, 0))


if __name__ == "__main__":
    unittest.main()
