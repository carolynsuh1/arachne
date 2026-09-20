"""Backend behaviour the Arachne (Next.js) app relies on: person university, and the optional internal key."""
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents.knowledge_graph import build_graph
from app.database import Base, get_db
from app.internal_key import install_internal_key_guard
from app.models import Goal, Person
from app.routers.goals import router as goals_router
from app.routers.person_data import router


class PersonUniversityTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        app = FastAPI()
        app.include_router(router)

        def dependency():
            with self.Session() as db:
                yield db

        app.dependency_overrides[get_db] = dependency
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def test_university_is_saved_listed_and_in_the_graph(self):
        created = self.client.post("/person-data", json={"name": "Elena Rostova", "university": "  UC   Berkeley "})
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["university"], "UC Berkeley")

        listed = self.client.get("/person-data").json()
        self.assertEqual(listed, [{"id": created.json()["id"], "name": "Elena Rostova", "university": "UC Berkeley"}])

        with self.Session() as db:
            (node,) = build_graph(db).nodes
        self.assertEqual(node.data.university, "UC Berkeley")

    def test_university_is_optional_and_duplicate_names_still_conflict(self):
        self.assertEqual(self.client.post("/person-data", json={"name": "Sana Kothari"}).json()["university"], "")
        duplicate = self.client.post("/person-data", json={"name": " sana   kothari ", "university": "Stanford"})
        self.assertEqual(duplicate.status_code, 409)
        with self.Session() as db:
            self.assertEqual(db.query(Person).count(), 1)


class GoalViewForOnePersonsMapTests(unittest.TestCase):
    """GET /goals/{id}/graph?person_ids=... scores only those people (a user's own map)."""

    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        with self.Session() as db:
            db.add_all(
                [
                    Person(id="a", name="Ada Berkeley Student", university="UC Berkeley", bio="consulting club member"),
                    Person(id="b", name="Bo Unrelated", university="Somewhere Else"),
                    Person(id="c", name="Cy Elsewhere", university="UC Berkeley"),
                    Person(id="d", name="Di Not On My Map", university="UC Berkeley", bio="consulting club"),
                ]
            )
            db.add(Goal(id="g1", text="Get into a Berkeley consulting club"))
            db.commit()
        app = FastAPI()
        app.include_router(goals_router)

        def dependency():
            with self.Session() as db:
                yield db

        app.dependency_overrides[get_db] = dependency
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def test_only_the_given_people_are_scored_and_all_are_returned_best_first(self):
        graph = self.client.get("/goals/g1/graph", params={"person_ids": "a,b,c"}).json()
        ranked = graph["ranked"]
        self.assertEqual({item["id"] for item in ranked}, {"a", "b", "c"})  # "d" is not on this map
        self.assertEqual(ranked[0]["id"], "a")  # bio + university both overlap the goal
        scores = {item["id"]: item["score"] for item in ranked}
        self.assertGreater(scores["a"], scores["c"])  # c only shares the university
        self.assertGreater(scores["c"], scores["b"])  # b has no overlap at all
        self.assertEqual(scores["b"], 0)
        self.assertEqual(next(i for i in ranked if i["id"] == "b")["why"], "No overlap with this goal yet.")

    def test_university_counts_toward_the_match(self):
        graph = self.client.get("/goals/g1/graph", params={"person_ids": "c"}).json()
        (only,) = graph["ranked"]
        self.assertGreater(only["score"], 0)
        self.assertIn("berkeley", only["why"].lower())

    def test_empty_list_returns_nobody_and_missing_goal_is_404(self):
        self.assertEqual(self.client.get("/goals/g1/graph", params={"person_ids": ""}).json()["ranked"], [])
        self.assertEqual(self.client.get("/goals/nope/graph", params={"person_ids": "a"}).status_code, 404)

    def test_without_person_ids_it_still_returns_the_network_wide_top_matches(self):
        ranked = self.client.get("/goals/g1/graph").json()["ranked"]
        self.assertEqual(ranked[0]["id"] in {"a", "d"}, True)
        self.assertLessEqual(len(ranked), 6)


class InternalKeyTests(unittest.TestCase):
    def client(self, key):
        app = FastAPI()
        install_internal_key_guard(app, key)

        @app.get("/health")
        def health():
            return {"ok": True}

        @app.get("/secret")
        def secret():
            return {"ok": True}

        return TestClient(app)

    def test_guard_is_off_without_a_key(self):
        self.assertEqual(self.client("").get("/secret").status_code, 200)

    def test_requests_need_the_key_except_health(self):
        client = self.client("s3cret")
        self.assertEqual(client.get("/health").status_code, 200)
        self.assertEqual(client.get("/secret").status_code, 401)
        self.assertEqual(client.get("/secret", headers={"X-Internal-Key": "wrong"}).status_code, 401)
        self.assertEqual(client.get("/secret", headers={"X-Internal-Key": "s3cret"}).status_code, 200)


if __name__ == "__main__":
    unittest.main()
