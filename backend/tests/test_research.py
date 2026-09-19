import unittest
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import httpx
from app.database import Base, get_db
from app.models import Person, ResearchBrief
from app.routers.research import router

class ResearchTests(unittest.TestCase):
 def setUp(self):
  self.engine=create_engine("sqlite://",connect_args={"check_same_thread":False},poolclass=StaticPool)
  Base.metadata.create_all(self.engine)
  self.Session=sessionmaker(bind=self.engine)
  with self.Session() as db:
   db.add(Person(id="p1",name="Maya Patel",bio="Original bio"));db.commit()
  app=FastAPI();app.include_router(router)
  def db_dep():
   with self.Session() as db:yield db
  app.dependency_overrides[get_db]=db_dep
  self.client=TestClient(app)
  self.payload={"name":"Maya Patel","affiliation":"Example University","person_id":"p1"}
 def tearDown(self):self.client.close();self.engine.dispose()
 def test_saved_brief_does_not_change_person(self):
  with patch("app.routers.research.httpx.AsyncClient") as factory:
   factory.return_value.__aenter__.return_value.post=AsyncMock(return_value=httpx.Response(200,json={"status":"ready","person":"Maya Patel","facts":[]}))
   r=self.client.post("/research",json=self.payload)
  self.assertEqual(r.status_code,200)
  self.assertTrue(self.client.get("/research/people/p1").json()["saved"])
  with self.Session() as db:self.assertEqual(db.get(Person,"p1").bio,"Original bio")
 def test_discovery_does_not_save_brief(self):
  with patch("app.routers.research.httpx.AsyncClient") as factory:
   factory.return_value.__aenter__.return_value.post=AsyncMock(return_value=httpx.Response(200,json={"status":"needs_confirmation","candidates":[]}))
   self.client.post("/research",json=self.payload)
  with self.Session() as db:self.assertEqual(db.query(ResearchBrief).count(),0)
 def test_cannot_attach_wrong_name(self):
  self.assertEqual(self.client.post("/research",json={**self.payload,"name":"Other"}).status_code,422)
 def test_service_down_is_actionable(self):
  with patch("app.routers.research.httpx.AsyncClient") as factory:
   factory.return_value.__aenter__.return_value.post=AsyncMock(side_effect=httpx.ConnectError("down"))
   r=self.client.post("/research",json=self.payload)
  self.assertEqual(r.status_code,503)
if __name__=="__main__":unittest.main()
