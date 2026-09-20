import unittest
import json
from uuid import uuid4
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
from app.routers.personal_profile import router as profile_router

class ResearchTests(unittest.TestCase):
 def setUp(self):
  self.engine=create_engine("sqlite://",connect_args={"check_same_thread":False},poolclass=StaticPool)
  Base.metadata.create_all(self.engine)
  self.Session=sessionmaker(bind=self.engine)
  with self.Session() as db:
   db.add(Person(id="p1",name="Maya Patel",bio="Original bio"));db.commit()
  app=FastAPI();app.include_router(router);app.include_router(profile_router)
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
 def test_personal_profiles_persist_separately(self):
  first,second=str(uuid4()),str(uuid4())
  self.assertEqual(self.client.put('/my-profile/'+first,json={'background':'Robotics beginner'}).status_code,200)
  self.assertEqual(self.client.get('/my-profile/'+first).json()['background'],'Robotics beginner')
  self.assertEqual(self.client.get('/my-profile/'+second).json()['background'],'')
 def test_research_passes_saved_profile_to_engine(self):
  profile_id=str(uuid4())
  self.client.put('/my-profile/'+profile_id,json={'interests':'Accessible education'})
  with patch("app.routers.research.httpx.AsyncClient") as factory:
   post=AsyncMock(return_value=httpx.Response(200,json={'status':'ready','person':'Maya Patel','facts':[]}))
   factory.return_value.__aenter__.return_value.post=post
   self.assertEqual(self.client.post('/research',json={**self.payload,'viewer_profile_id':profile_id}).status_code,200)
   self.assertEqual(post.call_args.kwargs['json']['viewerProfile']['interests'],'Accessible education')
 def test_regenerate_preserves_research_and_person_link(self):
  profile_id=str(uuid4())
  self.client.put('/my-profile/'+profile_id,json={'goals':'Learn robotics'})
  facts=[{'id':'f1','claim':'Built a robot'}]
  with self.Session() as db:
   db.add(ResearchBrief(id='old',person_id='p1',result_json=json.dumps({'person':'Maya Patel','affiliation':'Example University','status':'ready','facts':facts})));db.commit()
  with patch("app.routers.research.httpx.AsyncClient") as factory:
   factory.return_value.__aenter__.return_value.post=AsyncMock(return_value=httpx.Response(200,json={'questions':[{'text':'What should I learn first?'}]},request=httpx.Request('POST','http://test')))
   response=self.client.post('/research/briefs/old/questions',json={'viewer_profile_id':profile_id,'goal':'Get advice'})
  self.assertEqual(response.status_code,200)
  self.assertEqual(response.json()['facts'],facts)
  with self.Session() as db:
   self.assertEqual(db.query(ResearchBrief).count(),2)
   self.assertEqual(db.get(ResearchBrief,response.json()['brief_id']).person_id,'p1')

 def test_linkedin_fields_persist_and_feed_questions_without_replacing_goals(self):
  from app.routers.research import load_viewer
  profile_id=str(uuid4())
  data={'name':'Maya Patel','goals':'Find a mentor','interests':'Design','linkedin':{'url':'https://www.linkedin.com/in/maya/','retrievedAt':'2026-09-19','name':'Maya Patel','experience':[{'company':'Acme','position':'Developer','summary':'Built reporting tools for client portfolios'}],'education':[{'school':'Example University'}]}}
  self.assertEqual(self.client.put('/my-profile/'+profile_id,json=data).status_code,200)
  saved=self.client.get('/my-profile/'+profile_id).json()
  self.assertEqual(saved['goals'],'Find a mentor')
  self.assertEqual(saved['linkedin']['experience'][0]['company'],'Acme')
  with self.Session() as db:
   viewer=load_viewer(db,profile_id)
  self.assertIn('Developer / Acme',viewer['background'])
  self.assertIn('Built reporting tools for client portfolios',viewer['professionalBackground'])
  self.assertEqual(viewer['goals'],'Find a mentor')
 def test_linkedin_import_is_preview_only(self):
  with patch('app.routers.personal_profile.httpx.AsyncClient') as factory:
   factory.return_value.__aenter__.return_value.post=AsyncMock(return_value=httpx.Response(200,json={'url':'https://www.linkedin.com/in/maya/','retrievedAt':'2026-09-19','profile':{'name':'Maya Patel','experience':[],'education':[]}}))
   response=self.client.post('/my-profile/import-linkedin',json={'profileUrl':'https://www.linkedin.com/in/maya/'})
  self.assertEqual(response.status_code,200)
  self.assertEqual(self.client.get('/my-profile').json(),[])

if __name__=="__main__":unittest.main()
