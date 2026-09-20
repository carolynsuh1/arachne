import unittest
from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import Person
from app.routers.interactions import router


class InteractionMemoryTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.Session = sessionmaker(bind=self.engine)
        Base.metadata.create_all(self.engine)
        with self.Session() as db:
            db.add(
                Person(
                    id="p-maya",
                    name="Maya Chen",
                    bio="Robotics researcher",
                    interests="[]",
                    skills="[]",
                )
            )
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

    def test_saves_and_lists_voice_debrief(self):
        happened_at = datetime.now().replace(microsecond=0)
        response = self.client.post(
            "/interactions",
            json={
                "person_id": "p-maya",
                "person_name": "Maya Chen",
                "transcript": "We discussed robot learning. I promised an introduction.",
                "happened_at": happened_at.isoformat(),
            },
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["person_name"], "Maya Chen")

        older = happened_at - timedelta(days=1)
        self.client.post(
            "/interactions",
            json={
                "person_name": "Alex Guest",
                "transcript": "Met at the conference.",
                "happened_at": older.isoformat(),
            },
        )
        memories = self.client.get("/interactions").json()
        self.assertEqual([item["person_name"] for item in memories], [
            "Maya Chen",
            "Alex Guest",
        ])

    def test_rejects_mismatched_selected_person(self):
        response = self.client.post(
            "/interactions",
            json={
                "person_id": "p-maya",
                "person_name": "Someone Else",
                "transcript": "A valid debrief.",
                "happened_at": datetime.now().isoformat(),
            },
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
