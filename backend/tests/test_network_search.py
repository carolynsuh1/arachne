import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import InteractionMemory, Organization, Person, Relationship
from app.routers.network import router


class NetworkSearchTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)
        with self.Session() as db:
            db.add_all([
                Person(id="p-maya", name="Maya Patel", bio="Robotics researcher", interests=json.dumps(["prosthetics"]), skills="[]"),
                Person(id="p-sam", name="Sam Lee", bio="Design student", interests="[]", skills="[]"),
                Organization(id="o-lab", name="Mobility Lab", type="lab", description="Robotics and prosthetics"),
                Relationship(id="r-maya-lab", source_type="person", source_id="p-maya", target_type="organization", target_id="o-lab", type="works_at", strength=0.9, evidence="Works at lab"),
                InteractionMemory(id="i-sam", person_id="p-sam", person_name="Sam Lee", transcript="Talked recently", happened_at=datetime.now(timezone.utc) - timedelta(days=2)),
            ])
            db.commit()
        app = FastAPI()
        app.include_router(router)

        def db_dep():
            with self.Session() as db:
                yield db

        app.dependency_overrides[get_db] = db_dep
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()

    @patch("app.routers.network.elastic_search")
    def test_search_expands_organization_and_explains_rank(self, elastic_search):
        elastic_search.return_value = [
            {"entity_id": "o-lab", "name": "Mobility Lab", "type": "organization", "score": 0.9},
            {"entity_id": "p-sam", "name": "Sam Lee", "type": "person", "score": 0.4},
        ]
        response = self.client.post("/network/search", json={"query": "Who could introduce me to someone working in robotics?"})
        self.assertEqual(response.status_code, 200)
        results = response.json()["results"]
        self.assertEqual(results[0]["person_id"], "p-maya")
        self.assertIn("Mobility Lab", results[0]["why"])
        self.assertIn("comfortable making an introduction", results[0]["suggested_action"])

    @patch("app.routers.network.elastic_search")
    def test_reconnect_query_rewards_no_recent_interaction(self, elastic_search):
        elastic_search.return_value = [
            {"entity_id": "p-maya", "name": "Maya Patel", "type": "person", "score": 1.0},
            {"entity_id": "p-sam", "name": "Sam Lee", "type": "person", "score": 1.0},
        ]
        results = self.client.post("/network/search", json={"query": "Who haven't I talked to recently?"}).json()["results"]
        maya = next(result for result in results if result["person_id"] == "p-maya")
        sam = next(result for result in results if result["person_id"] == "p-sam")
        self.assertGreater(maya["recency_score"], sam["recency_score"])


if __name__ == "__main__":
    unittest.main()
