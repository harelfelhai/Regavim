"""
Shared pytest fixtures.

Database strategy:
  A temporary file-based SQLite database is created once per test session.
  File-based SQLite (vs in-memory) allows multiple threads to obtain their own
  connections from the pool, which is required for the concurrency tests.
  StaticPool (single shared connection) was intentionally avoided because it
  serialises all writes to one connection and is not thread-safe under load.

  The autouse clear_tables fixture truncates all rows between tests so each
  test starts with a clean slate without the overhead of recreating the schema.
"""

import os
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import backend.models  # noqa: F401 — registers all ORM models with Base.metadata
from backend.db.base import Base
from backend.db.session import get_db
from backend.main import app

# ── Test database — file-based SQLite, one connection per session ─────────────
_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.close(_db_fd)

TEST_DB_URL = f"sqlite:///{_db_path}"

test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    # Default QueuePool: each session gets its own connection.
    # This is required for concurrent tests to avoid connection-level corruption.
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

Base.metadata.create_all(bind=test_engine)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db


def pytest_sessionfinish(session, exitstatus):
    """Clean up the temp DB file after the full test run."""
    try:
        os.unlink(_db_path)
    except OSError:
        pass


@pytest.fixture(scope="session")
def client():
    """Single TestClient reused for the whole test session."""
    return TestClient(app)


@pytest.fixture
def db():
    """Direct DB session for ORM-level tests."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def clear_tables():
    """Delete all rows between tests to ensure isolation."""
    yield
    with test_engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
