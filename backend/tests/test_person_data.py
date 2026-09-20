import json
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import Person, ResearchBrief, ResumeRecord
from app.routers.person_data import router


class PersonDataTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        with self.Session() as db:
            db.add_all([Person(id="p1", name="Maya Patel", bio="Keep this"), Person(id="p2", name="Other Person")])
            db.add(ResearchBrief(id="b1", result_json=json.dumps({"status": "ready", "person": "Maya Patel"})))
            db.commit()
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

    def upload(self, name="Maya Patel"):
        result = {"status": "ready", "profile": {"name": {"value": name}}, "supportedFields": 1}
        with patch("app.routers.person_data.extract_pdf", return_value={"lines": [{"id": "L1", "text": name}]}), patch("app.routers.person_data.httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value.post = AsyncMock(return_value=httpx.Response(200, json=result, request=httpx.Request("POST", "http://test/api/resume")))
            response = self.client.post("/person-data/p1/resume", content=b"%PDF-example", headers={"Content-Type": "application/pdf"})
            return response, factory

    def test_research_and_resume_reopen_on_same_person(self):
        self.assertEqual(self.client.post("/person-data/p1/research/b1").status_code, 200)
        self.assertEqual(self.upload()[0].status_code, 200)
        history = self.client.get("/person-data/p1").json()
        self.assertEqual(len(history["research"]), 1)
        self.assertEqual(len(history["resumes"]), 1)
        with self.Session() as db:
            self.assertEqual(db.get(Person, "p1").bio, "Keep this")
        self.assertEqual(self.client.get("/person-data/p2").json()["resumes"], [])

    def test_wrong_resume_name_never_saved(self):
        self.assertEqual(self.upload("Other Person")[0].status_code, 422)
        with self.Session() as db:
            self.assertEqual(db.query(ResumeRecord).count(), 0)

    def test_duplicate_pdf_does_not_call_provider_again(self):
        self.upload()
        response, factory = self.upload()
        self.assertTrue(response.json()["cached"])
        factory.assert_not_called()

    def test_wrong_brief_cannot_attach(self):
        self.assertEqual(self.client.post("/person-data/p2/research/b1").status_code, 422)
        self.assertEqual(self.client.get("/person-data/p2").json()["research"], [])

    def test_duplicate_person_requires_selection(self):
        self.assertEqual(self.client.post("/person-data", json={"name": " maya   patel "}).status_code, 409)
        self.assertEqual(self.client.post("/person-data", json={"name": "New Person"}).status_code, 200)

    def test_invalid_upload_and_unknown_person(self):
        self.assertEqual(self.client.post("/person-data/missing/resume", content=b"%PDF-x").status_code, 404)
        self.assertEqual(self.client.post("/person-data/p1/resume", content=b"bad", headers={"Content-Type": "application/pdf"}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
