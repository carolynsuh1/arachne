import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import GraphEvidence, Person, Relationship, Reminder
from app.routers.goals import router as goals_router
from app.routers.meetings import router as meetings_router
from app.routers.sync import router as sync_router


class HackmitDemoTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        app = FastAPI()
        app.include_router(sync_router)
        app.include_router(goals_router)
        app.include_router(meetings_router)

        def dependency():
            with self.Session() as db:
                yield db

        app.dependency_overrides[get_db] = dependency
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def test_demo_meeting_changes_context_provenance_and_top_recommendation(self):
        demo = self.client.post("/sync/hackmit-demo").json()
        before = self.client.get(f"/goals/{demo['goal_id']}/graph").json()
        maya_before = next(item for item in before["ranked"] if item["id"] == demo["maya_id"])

        meeting = self.client.post(
            "/meetings",
            json={
                "person_ids": [demo["sarah_id"]],
                "goal_id": demo["goal_id"],
                "meeting_type": "coffee_chat",
            },
        ).json()
        self.client.post(
            f"/meetings/{meeting['id']}/chunks",
            json={"text": demo["transcript"]},
        )
        review = self.client.post(f"/meetings/{meeting['id']}/end").json()
        confirmed = self.client.post(
            f"/meetings/{meeting['id']}/confirm",
            json={
                "cards": review["extraction"]["cards"],
                "introductions": review["extraction"]["introductions"],
            },
        )
        self.assertEqual(confirmed.status_code, 200)

        after = self.client.get(f"/goals/{demo['goal_id']}/graph").json()
        maya_after = next(item for item in after["ranked"] if item["id"] == demo["maya_id"])
        self.assertEqual(maya_after["rank"], 1)
        self.assertGreater(maya_after["score"], maya_before["score"])
        self.assertGreater(maya_after["intro_probability"], maya_before["intro_probability"])
        self.assertIn("Ask Sarah", maya_after["next_action"])

        with self.Session() as db:
            sarah = db.get(Person, demo["sarah_id"])
            self.assertNotIn("robotics", sarah.interests.casefold())
            offered = db.get(
                Relationship,
                f"intro-{demo['sarah_id']}-{demo['maya_id']}",
            )
            self.assertEqual(offered.type, "offered_intro")
            self.assertIsNotNone(
                db.query(GraphEvidence)
                .filter(
                    GraphEvidence.entity_id == offered.id,
                    GraphEvidence.evidence_id == meeting["id"],
                )
                .first()
            )
            self.assertGreater(db.query(Reminder).count(), 0)


if __name__ == "__main__":
    unittest.main()
