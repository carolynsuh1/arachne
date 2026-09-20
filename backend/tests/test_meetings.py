import unittest
from datetime import datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import BrainDumpItem, Meeting, Person, Relationship, Reminder
from app.routers.meetings import router


TRANSCRIPT = (
    "Sarah said AI agent internships at Anthropic open in October. "
    "You should talk to Jason. He works on agent infrastructure at Anthropic. "
    "I promised to send Sarah my HackMIT project next week."
)


class MeetingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
        )
        self.Session = sessionmaker(bind=self.engine)
        Base.metadata.create_all(self.engine)
        with self.Session() as db:
            db.add(Person(id="sarah", name="Sarah Chen", bio="", interests="[]", skills="[]"))
            db.commit()
        app = FastAPI()
        app.include_router(router)

        def test_db():
            with self.Session() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)

    def tearDown(self):
        self.engine.dispose()

    def test_live_extract_confirm_list_and_ask(self):
        started = self.client.post("/meetings", json={
            "person_ids": ["sarah"], "meeting_type": "coffee_chat",
            "goal_text": "Learn about AI agent internships",
        })
        self.assertEqual(started.status_code, 201)
        meeting_id = started.json()["id"]

        live = self.client.post(f"/meetings/{meeting_id}/chunks", json={"text": TRANSCRIPT})
        self.assertEqual(live.status_code, 200)
        body = live.json()
        self.assertEqual(body["extraction"]["introductions"][0]["name"], "Jason")
        self.assertTrue(any(card["category"] == "commitments" for card in body["extraction"]["cards"]))

        ended = self.client.post(f"/meetings/{meeting_id}/end")
        self.assertEqual(ended.status_code, 200)
        confirmed = self.client.post(f"/meetings/{meeting_id}/confirm", json={
            "cards": ended.json()["extraction"]["cards"],
            "introductions": ended.json()["extraction"]["introductions"],
        })
        self.assertEqual(confirmed.status_code, 200)

        with self.Session() as db:
            self.assertEqual(db.get(Meeting, meeting_id).status, "confirmed")
            self.assertGreater(db.query(BrainDumpItem).count(), 0)
            self.assertGreater(db.query(Reminder).count(), 0)
            jason = next(person for person in db.query(Person).all() if person.name == "Jason")
            self.assertIsNotNone(db.get(Relationship, f"intro-sarah-{jason.id}"))

        listed = self.client.get("/meetings", params={"person_id": "sarah", "topic": "internships"})
        self.assertEqual(len(listed.json()), 1)
        asked = self.client.post("/meetings/ask/query", json={
            "question": "What did Sarah say about internships?",
        })
        self.assertEqual(asked.status_code, 200)
        self.assertIn("internships", asked.json()["answer"].lower())
        self.assertEqual(asked.json()["citations"][0]["meeting_id"], meeting_id)


if __name__ == "__main__":
    unittest.main()
