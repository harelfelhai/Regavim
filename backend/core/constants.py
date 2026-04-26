"""
Shared enumerations used by both ORM models and Pydantic schemas.
The violation categories also serve as the constrained output schema
fed to Claude during AI image analysis.
"""

from enum import Enum


class ViolationCategory(str, Enum):
    ILLEGAL_CONSTRUCTION = "ILLEGAL_CONSTRUCTION"
    LAND_GRADING = "LAND_GRADING"
    AGRICULTURAL_ENCROACHMENT = "AGRICULTURAL_ENCROACHMENT"
    ROAD_PAVING = "ROAD_PAVING"
    DEMOLITION = "DEMOLITION"
    ILLEGAL_DUMPING = "ILLEGAL_DUMPING"
    OTHER = "OTHER"


class ReportStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class UserRole(str, Enum):
    COORDINATOR = "coordinator"
    MANAGER = "manager"
    ADMIN = "admin"
