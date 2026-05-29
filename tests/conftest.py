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
from backend.api.deps import get_current_user
from backend.db.base import Base
from backend.db.session import get_db
from backend.main import app
from backend.models.user import User as UserModel

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

# ── Auth override — keeps all existing tests green ────────────────────────────
# Returns a stub User with the same ID as the former _PLACEHOLDER_USER_ID so
# reporter_id filter tests continue to pass without modification.
# Tests that need to exercise real JWT authentication use the auth_client fixture
# below, which temporarily removes this override.
_STUB_USER_ID = "00000000-0000-0000-0000-000000000001"
_stub_user = UserModel(
    id=_STUB_USER_ID,
    email="stub@regavim.org",
    role="coordinator",
    hashed_password="not-a-real-hash",
)
app.dependency_overrides[get_current_user] = lambda: _stub_user


def pytest_sessionfinish(session, exitstatus):
    """Clean up the temp DB file after the full test run."""
    try:
        os.unlink(_db_path)
    except OSError:
        pass


@pytest.fixture(scope="session")
def client():
    """Single TestClient reused for the whole test session. Auth is bypassed via stub override."""
    return TestClient(app)


@pytest.fixture
def auth_client():
    """
    TestClient with real JWT authentication (get_current_user override removed).
    Use this fixture in test_auth.py to test the actual login / token flow.
    The override is restored after each test so other tests are unaffected.
    """
    saved = app.dependency_overrides.pop(get_current_user, None)
    yield TestClient(app)
    if saved is not None:
        app.dependency_overrides[get_current_user] = saved


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
