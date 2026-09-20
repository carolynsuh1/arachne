import unittest
from datetime import datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import BrainDumpItem, Person, Relationship, Reminder
from app.routers.brain_dumps import router

TRANSCRIPT = (
    "I just talked to Sarah. She told me she’s working on AI infrastructure at a startup "
    "and used to intern at NVIDIA. She said I should talk to her friend Jason, who works "
    "on agents. She also told me to send her my project next week. We talked about HackMIT "
    "and she seemed really interested in what we're building."
)


class BrainDumpTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
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

    def test_extracts_intro_and_reminder_then_confirms(self):
        extracted = self.client.post("/brain-dumps/extract", json={
            "person_id": "sarah", "transcript": TRANSCRIPT,
        })
        self.assertEqual(extracted.status_code, 200)
        body = extracted.json()
        self.assertEqual(body["introductions"][0]["name"], "Jason")
        self.assertTrue(any(card["category"] == "commitments" for card in body["cards"]))

        with self.Session() as db:
            self.assertIsNone(next((p for p in db.query(Person).all() if p.name == "Jason"), None))
            self.assertEqual(db.query(Relationship).count(), 0)

        confirmed = self.client.post("/brain-dumps/confirm", json={
            "person_id": "sarah", "transcript": TRANSCRIPT,
            "happened_at": datetime(2026, 9, 16).isoformat(),
            "cards": body["cards"], "introductions": body["introductions"],
        })
        self.assertEqual(confirmed.status_code, 201)
        with self.Session() as db:
            jason = next(p for p in db.query(Person).all() if p.name == "Jason")
            self.assertIsNotNone(db.get(Relationship, f"intro-sarah-{jason.id}"))
            self.assertGreater(db.query(BrainDumpItem).count(), 0)
            self.assertGreater(db.query(Reminder).count(), 0)
            self.assertIn("AI infrastructure", db.get(Person, "sarah").bio)

        next_people = self.client.get("/brain-dumps/who-next").json()
        self.assertEqual(next_people[0]["name"], "Jason")
        self.assertEqual(next_people[0]["path"], ["You", "Sarah Chen", "Jason"])


if __name__ == "__main__":
    unittest.main()
