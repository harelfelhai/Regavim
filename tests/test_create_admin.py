"""
Tests for the create_admin.py CLI helper.

All tests inject the test DB session via the `_db` parameter so no real
SessionLocal / engine is exercised — consistent with the rest of the test suite.
"""

import pytest

from backend.core.security import verify_password
from backend.create_admin import create_user
from backend.models.user import User as UserModel


class TestCreateUser:
    def test_creates_user_in_db(self, db):
        create_user("admin@test.com", "SecurePass1!", "admin", _db=db)
        user = db.query(UserModel).filter(UserModel.email == "admin@test.com").first()
        assert user is not None

    def test_email_stored_correctly(self, db):
        create_user("mgr@test.com", "Pass1234!", "manager", _db=db)
        user = db.query(UserModel).filter(UserModel.email == "mgr@test.com").first()
        assert user.email == "mgr@test.com"

    def test_role_stored_correctly(self, db):
        create_user("coord@test.com", "Pass1234!", "coordinator", _db=db)
        user = db.query(UserModel).filter(UserModel.email == "coord@test.com").first()
        assert user.role == "coordinator"

    def test_default_role_is_admin(self, db):
        create_user("admin2@test.com", "Pass1234!", _db=db)
        user = db.query(UserModel).filter(UserModel.email == "admin2@test.com").first()
        assert user.role == "admin"

    def test_password_is_hashed_not_plaintext(self, db):
        create_user("hashed@test.com", "PlainSecret!", _db=db)
        user = db.query(UserModel).filter(UserModel.email == "hashed@test.com").first()
        assert user.hashed_password != "PlainSecret!"

    def test_password_verifies_correctly(self, db):
        create_user("verify@test.com", "CorrectHorse99!", _db=db)
        user = db.query(UserModel).filter(UserModel.email == "verify@test.com").first()
        assert verify_password("CorrectHorse99!", user.hashed_password)

    def test_returns_user_object_with_id(self, db):
        user = create_user("returned@test.com", "Pass1234!", _db=db)
        assert user.id is not None
        assert len(user.id) == 36  # UUID format

    def test_duplicate_email_raises_value_error(self, db):
        create_user("dup@test.com", "Pass1234!", _db=db)
        with pytest.raises(ValueError, match="already exists"):
            create_user("dup@test.com", "Other1234!", _db=db)

    def test_all_three_roles_accepted(self, db):
        for role in ("coordinator", "manager", "admin"):
            user = create_user(f"{role}@test.com", "Pass1234!", role, _db=db)
            assert user.role == role
