"""
FastAPI application entry point.

Run locally with:
    uvicorn backend.main:app --reload

Interactive API docs available at:
    http://localhost:8000/docs
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import backend.models  # noqa: F401 — registers all ORM models with SQLAlchemy metadata
from backend.api.v1 import auth, images, reports
from backend.db.base import Base
from backend.db.session import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create all DB tables on startup. Use Alembic migrations in production."""
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Regavim Land-Use Monitor API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to specific origins in production
    allow_credentials=False,  # JWT Bearer tokens don't use cookies; credentials flag not needed
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reports.router, prefix="/api/v1/reports", tags=["reports"])
app.include_router(images.router, prefix="/api/v1/images", tags=["images"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}
