import unittest
from datetime import datetime,timedelta
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base,get_db
from app.models import Person,Reminder,InteractionMemory,FollowUpState
from app.routers.followups import router
from app.routers.brain_dumps import upcoming

class FollowUpTests(unittest.TestCase):
 def setUp(self):
  self.engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
  Base.metadata.create_all(self.engine); self.Session=sessionmaker(bind=self.engine)
  self.now=datetime.utcnow()
  with self.Session() as db:
   db.add(Person(id='p',name='Test Person'))
   db.add(InteractionMemory(id='m',person_id='p',person_name='Test Person',transcript='I promised to send the project notes.',happened_at=self.now))
   for id,days in [('late',-2),('soon',2),('undated',None)]:db.add(Reminder(id=id,person_id='p',interaction_id='m',action='Send notes '+id,due_at=self.now+timedelta(days=days) if days is not None else None))
   db.commit()
  app=FastAPI();app.include_router(router)
  def dependency():
   with self.Session() as db:yield db
  app.dependency_overrides[get_db]=dependency;self.client=TestClient(app)
 def tearDown(self):self.client.close();self.engine.dispose()
 def test_priority_and_source(self):
  rows=self.client.get('/follow-ups').json()
  self.assertEqual([r['id'] for r in rows],['late','soon','undated'])
  self.assertIn('promised',rows[0]['source']['transcript'])
  self.assertIsNone(rows[-1]['due_at'])
 def test_outcomes_persist_and_restore(self):
  for action,bucket in [('done','done'),('restore','active'),('dismiss','dismissed')]:
   self.assertEqual(self.client.patch('/follow-ups/late',json={'action':action}).status_code,200)
   self.assertEqual(self.client.get('/follow-ups').json()[0]['bucket'],bucket)
  with self.Session() as db:self.assertNotIn('late',[r.id for r in upcoming(10,db)])
 def test_snooze_preserves_deadline_and_expires(self):
  old=self.client.get('/follow-ups').json()[0]['due_at']
  self.client.patch('/follow-ups/late',json={'action':'snooze','days':1})
  row=self.client.get('/follow-ups').json()[0]
  self.assertEqual(row['bucket'],'snoozed');self.assertEqual(row['due_at'],old)
  with self.Session() as db:
   self.assertNotIn('late',[r.id for r in upcoming(10,db)])
   db.get(FollowUpState,'late').snoozed_until=self.now-timedelta(seconds=1);db.commit()
  self.assertEqual(self.client.get('/follow-ups').json()[0]['bucket'],'active')
 def test_invalid_action_and_missing_id(self):
  self.assertEqual(self.client.patch('/follow-ups/late',json={'action':'erase'}).status_code,422)
  self.assertEqual(self.client.patch('/follow-ups/missing',json={'action':'done'}).status_code,404)
 def test_legacy_dismissed_and_wrong_person_source(self):
  with self.Session() as db:
   db.get(Reminder,'late').status='dismissed'
   db.get(InteractionMemory,'m').person_id='another-person'
   db.commit()
  row=self.client.get('/follow-ups').json()[0]
  self.assertEqual(row['bucket'],'dismissed');self.assertIsNone(row['source'])
 def test_no_invented_deadline_and_windows_safe_voice_action(self):
  from app.routers.brain_dumps import _create_reminders,_natural_due,brain_dump_action
  from app.schemas import BrainDumpCard,BrainDumpActionIn
  self.assertIsNone(_natural_due('send the notes',self.now))
  self.assertEqual(_natural_due('send tomorrow',self.now),self.now+timedelta(days=1))
  with self.Session() as db:
   rows=_create_reminders(db,'p','m',[BrainDumpCard(category='follow_ups',text='Send the notes'),BrainDumpCard(category='commitments',text='Send the notes')],self.now)
   self.assertEqual(len(rows),1);self.assertIsNone(rows[0].due_at)
   response=brain_dump_action(BrainDumpActionIn(person_id='p',text='remind me to send notes tomorrow'),db)
   self.assertIn('Reminder saved',response.message)
