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
from app.models import Person
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
