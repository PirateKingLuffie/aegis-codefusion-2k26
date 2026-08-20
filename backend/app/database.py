from __future__ import annotations

from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any, Iterator

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


def utc_now() -> datetime:
    return datetime.now(UTC)


class Record(Base):
    __tablename__ = "records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    status: Mapped[str] = mapped_column(String(48), nullable=False, default="draft")
    seed: Mapped[str | None] = mapped_column(String(180), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    geometry: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    revisions: Mapped[list["RecordRevision"]] = relationship(
        back_populates="record", cascade="all, delete-orphan", order_by="RecordRevision.version"
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('incident','scenario','simulation','recommendation','workspace','resource')",
            name="ck_records_kind",
        ),
        CheckConstraint("version >= 1", name="ck_records_version"),
        Index("ix_records_kind_updated", "kind", "updated_at"),
    )


class RecordRevision(Base):
    __tablename__ = "record_revisions"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    record_id: Mapped[str] = mapped_column(ForeignKey("records.id", ondelete="CASCADE"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    geometry: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    actor: Mapped[str] = mapped_column(String(64), nullable=False, default="operator")

    record: Mapped[Record] = relationship(back_populates="revisions")

    __table_args__ = (
        CheckConstraint("version >= 1", name="ck_record_revisions_version"),
        Index("uq_record_revision", "record_id", "version", unique=True),
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"

    sequence: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    event_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    record_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    record_kind: Mapped[str | None] = mapped_column(String(32), nullable=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    source_class: Mapped[str] = mapped_column(String(24), nullable=False, default="OPERATOR")
    actor: Mapped[str] = mapped_column(String(64), nullable=False, default="operator")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    previous_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "source_class IN ('OPERATOR','OBSERVED','IMPORTED','ESTIMATED','SIMULATED')",
            name="ck_audit_events_source_class",
        ),
        Index("ix_audit_record_sequence", "record_id", "sequence"),
    )


settings = get_settings()
connect_args = (
    {"check_same_thread": False, "timeout": 15}
    if settings.database_url.startswith("sqlite")
    else {"connect_timeout": 10, "application_name": "aegis-operations-api"}
)
engine_options: dict[str, Any] = {
    "pool_pre_ping": True,
    "connect_args": connect_args,
}
if not settings.database_url.startswith("sqlite"):
    engine_options.update(pool_size=5, max_overflow=5, pool_recycle=1_800)
engine = create_engine(settings.database_url, **engine_options)

if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def configure_sqlite(dbapi_connection: Any, _: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=15000")
        cursor.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def initialise_database() -> None:
    Base.metadata.create_all(bind=engine)


@contextmanager
def session_scope() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
