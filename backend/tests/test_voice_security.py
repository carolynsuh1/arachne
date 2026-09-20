import base64
import hashlib
import hmac
import json
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Person
from app.services.voice_tools import run_voice_tool
from app.voice_token import VoiceTokenError, verify_voice_token


SECRET = "test-internal-key"


def token(payload: dict) -> str:
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode()
    ).decode().rstrip("=")
    signature = base64.urlsafe_b64encode(
        hmac.new(SECRET.encode(), encoded.encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")
    return f"{encoded}.{signature}"


class VoiceSecurityTests(unittest.TestCase):
    @patch.dict("os.environ", {"INTERNAL_API_KEY": SECRET})
    def test_accepts_valid_token(self):
        claims = verify_voice_token(
            token({"sub": "user-1", "exp": 200, "person_ids": ["mine"]}), now=100
        )
        self.assertEqual(claims["person_ids"], ["mine"])

    @patch.dict("os.environ", {"INTERNAL_API_KEY": SECRET})
    def test_rejects_expired_token(self):
        with self.assertRaisesRegex(VoiceTokenError, "expired"):
            verify_voice_token(
                token({"sub": "user-1", "exp": 100, "person_ids": []}), now=100
            )

    @patch.dict("os.environ", {"INTERNAL_API_KEY": SECRET})
    def test_rejects_tampered_token(self):
        valid = token({"sub": "user-1", "exp": 200, "person_ids": []})
        encoded, signature = valid.split(".")
        changed = ("A" if encoded[0] != "A" else "B") + encoded[1:]
        with self.assertRaisesRegex(VoiceTokenError, "Invalid"):
            verify_voice_token(f"{changed}.{signature}", now=100)

    @patch.dict("os.environ", {"INTERNAL_API_KEY": SECRET})
    def test_rejects_missing_token(self):
        with self.assertRaisesRegex(VoiceTokenError, "required"):
            verify_voice_token("", now=100)

    def test_voice_tools_only_see_allowed_people(self):
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Session = sessionmaker(bind=engine)
        Base.metadata.create_all(engine)
        with Session() as db:
            db.add_all(
                [
                    Person(id="mine", name="Mine", bio="", interests="[]", skills="[]"),
                    Person(id="other", name="Other", bio="", interests="[]", skills="[]"),
                ]
            )
            db.commit()
            searched = run_voice_tool(db, "search_people", {"query": ""}, {"mine"})
            self.assertEqual([person["id"] for person in searched["people"]], ["mine"])
            fetched = run_voice_tool(db, "get_person", {"id": "other"}, {"mine"})
            self.assertIsNone(fetched["person"])
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
