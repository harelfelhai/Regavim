"""
Declarative base shared by all ORM models.
Import Base here (not from SQLAlchemy directly) so every model
registers itself with the same metadata object.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
