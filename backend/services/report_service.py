"""
Business logic for report querying and lifecycle transitions.

apply_report_filters() is the single place that translates query-string
parameters into SQLAlchemy filter expressions, keeping the router thin.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Query

from backend.models.report import Report as ReportModel


def apply_report_filters(
    query: Query,
    status: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    reporter_id: Optional[str] = None,
) -> Query:
    """
    Chain WHERE clauses onto a base Report query.

    category matches either ai_category or final_category — both are
    violation category fields coordinators may want to filter on.
    """
    if status is not None:
        query = query.filter(ReportModel.status == status)
    if category is not None:
        query = query.filter(
            (ReportModel.ai_category == category) | (ReportModel.final_category == category)
        )
    if date_from is not None:
        query = query.filter(ReportModel.created_at >= date_from)
    if date_to is not None:
        query = query.filter(ReportModel.created_at <= date_to)
    if reporter_id is not None:
        query = query.filter(ReportModel.user_id == reporter_id)
    return query
