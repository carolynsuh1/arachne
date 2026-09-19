import json
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import Goal, GoalPlan, Organization, Person, PersonProfile, Relationship
from app.pipeline.extract import _normalize
from app.routers.goals import router as goals_router
from app.routers.network import router as network_router


class DashboardTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        with self.Session() as db:
            db.add_all(
                [
                    Person(
                        id="p-robot",
                        name="Rob Rivera",
                        bio="Robotics professor studying robot learning.",
                        interests=json.dumps(["robot learning"]),
                        skills=json.dumps(["reinforcement learning"]),
                    ),
                    Person(
                        id="p-design",
                        name="Dee Kim",
                        bio="Product designer for community tools.",
                        interests=json.dumps(["design"]),
                        skills=json.dumps(["research"]),
                    ),
                    Person(
                        id="p-student",
                        name="Sam Lee",
                        bio="Robotics PhD student.",
                        interests=json.dumps(["robotics"]),
                        skills=json.dumps(["Python"]),
                    ),
                    PersonProfile(person_id="p-robot", location="Berkeley, CA"),
                    PersonProfile(person_id="p-design", location="New York, NY"),
                    PersonProfile(person_id="p-student", location="Berkeley, CA"),
                    Organization(
                        id="o-robot",
                        name="Robot Company",
                        type="company",
                        description="Robotics company",
                    ),
                    Organization(
                        id="o-club",
                        name="Robotics Club",
                        type="club",
                        description="Student club",
                    ),
                    Relationship(
                        id="r-company",
                        source_type="person",
                        source_id="p-robot",
                        target_type="organization",
                        target_id="o-robot",
                        type="works_at",
                        strength=0.9,
                        evidence="Rob works there.",
                    ),
                    Relationship(
                        id="r-club",
                        source_type="person",
                        source_id="p-student",
                        target_type="organization",
                        target_id="o-club",
                        type="member_of",
                        strength=0.8,
                        evidence="Sam is a member.",
                    ),
                    Relationship(
                        id="r-intro",
                        source_type="person",
                        source_id="p-student",
                        target_type="person",
                        target_id="p-robot",
                        type="knows",
                        strength=0.8,
                        evidence="Sam recommends Rob.",
                    ),
                    Goal(id="g-robot", text="Join a robotics research lab"),
                    GoalPlan(
                        goal_id="g-robot",
                        summary="Find robot learning researchers.",
                        subgoals_json="[]",
                        needed_connections_json=json.dumps(
                            [{"kind": "faculty", "query": "robotics professor", "why": "advice"}]
                        ),
                        provider="heuristic",
                    ),
                ]
            )
            db.commit()

        app = FastAPI()
        app.include_router(goals_router)
        app.include_router(network_router)

        def db_dep():
            with self.Session() as db:
                yield db

        app.dependency_overrides[get_db] = db_dep
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def test_goal_graph_ranks_matches_and_has_no_overlaps(self):
        response = self.client.get("/goals/g-robot/graph")
        self.assertEqual(response.status_code, 200)
        graph = response.json()
        self.assertEqual(graph["goal_id"], "g-robot")
        self.assertEqual(graph["nodes"][0]["data"]["name"], "Rob Rivera")
        self.assertEqual(len(graph["edges"]), 1)

        for index, left in enumerate(graph["nodes"]):
            for right in graph["nodes"][index + 1 :]:
                dx = abs(left["position"]["x"] - right["position"]["x"])
                dy = abs(left["position"]["y"] - right["position"]["y"])
                self.assertTrue(dx >= 240 or dy >= 80)

    def test_tracker_groups_company_club_and_location(self):
        tracker = self.client.get("/network/tracker").json()
        self.assertEqual(tracker["companies"][0]["name"], "Robot Company")
        self.assertEqual(tracker["clubs"][0]["name"], "Robotics Club")
        berkeley = next(row for row in tracker["locations"] if row["name"] == "Berkeley, CA")
        self.assertEqual(berkeley["count"], 2)

    def test_tracker_sorts_widest_coverage_first_and_unknown_last(self):
        with self.Session() as db:
            db.add(
                Person(
                    id="p-nowhere",
                    name="Nia Ford",
                    bio="No location on file.",
                    interests="[]",
                    skills="[]",
                )
            )
            db.commit()

        locations = self.client.get("/network/tracker").json()["locations"]
        self.assertEqual([row["count"] for row in locations], sorted(
            (row["count"] for row in locations), reverse=True
        ))
        self.assertEqual(locations[0]["name"], "Berkeley, CA")
        self.assertEqual(locations[-1]["name"], "Unknown")

    def test_extractor_keeps_location(self):
        payload = _normalize(
            {
                "people": [
                    {
                        "id": "p-new",
                        "name": "New Person",
                        "location": "Boston, MA",
                    }
                ]
            },
            "notes.txt",
        )
        self.assertEqual(payload["people"][0]["location"], "Boston, MA")


if __name__ == "__main__":
    unittest.main()
