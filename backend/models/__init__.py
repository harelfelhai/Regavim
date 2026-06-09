"""
Importing all models here ensures they are registered with SQLAlchemy's
metadata before create_all() is called in main.py.
"""

from backend.models.user import User
from backend.models.report import Report
from backend.models.image import Image
from backend.models.complaint import ComplaintSubmission

__all__ = ["User", "Report", "Image", "ComplaintSubmission"]
