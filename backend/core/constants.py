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
    CONFIRMED = "confirmed"
    APPROVED = "approved"
    REJECTED = "rejected"
    DELETION_REQUESTED = "deletion_requested"


class UserRole(str, Enum):
    COORDINATOR = "coordinator"
    MANAGER = "manager"
    ADMIN = "admin"


class ComplaintAuthority(str, Enum):
    """Predefined authorities a report can be filed as a complaint to."""

    POLICE = "POLICE"
    ILA = "ILA"
    ENV_MINISTRY = "ENV_MINISTRY"
    LOCAL_PLANNING = "LOCAL_PLANNING"
    CIVIL_ADMIN = "CIVIL_ADMIN"


# Hebrew display labels for each authority. Keys are stable identifiers stored
# in the DB; the actual recipient email addresses live in Settings (config.py)
# so they can be configured per-environment without code changes.
COMPLAINT_AUTHORITY_LABELS: dict[str, str] = {
    ComplaintAuthority.POLICE.value: "משטרת ישראל",
    ComplaintAuthority.ILA.value: "רשות מקרקעי ישראל",
    ComplaintAuthority.ENV_MINISTRY.value: "המשרד להגנת הסביבה",
    ComplaintAuthority.LOCAL_PLANNING.value: "הוועדה המקומית לתכנון ובנייה",
    ComplaintAuthority.CIVIL_ADMIN.value: "המינהל האזרחי",
}


# Hebrew display labels for each violation category (used in complaint text).
VIOLATION_CATEGORY_LABELS: dict[str, str] = {
    ViolationCategory.ILLEGAL_CONSTRUCTION.value: "בנייה לא חוקית",
    ViolationCategory.LAND_GRADING.value: "עבודות עפר",
    ViolationCategory.AGRICULTURAL_ENCROACHMENT.value: "השתלטות על קרקע חקלאית",
    ViolationCategory.ROAD_PAVING.value: "סלילת דרך",
    ViolationCategory.DEMOLITION.value: "הריסה",
    ViolationCategory.ILLEGAL_DUMPING.value: "השלכת פסולת",
    ViolationCategory.OTHER.value: "אחר",
}
