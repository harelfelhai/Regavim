"""
Shared pytest fixtures.

All tests use an in-memory SQLite database via StaticPool so that every
session shares the same connection — required for in-memory SQLite where
each new connection would otherwise see a fresh, empty database.

The get_db dependency is overridden at module load time so the override
is active before any test request is made.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import backend.models  # noqa: F401 — registers all ORM models with Base.metadata
from backend.db.base import Base
from backend.db.session import get_db
from backend.main import app

_TEST_DB_URL = "sqlite:///:memory:"

test_engine = create_engine(
    _TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
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
