import math
import unittest
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import GraphEvidence, InteractionMemory, Person, Relationship
from app.services.relationship_scoring import recency_score, score_relationship


class RelationshipScoringTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)

    def tearDown(self):
        self.engine.dispose()

    def test_temporal_decay_uses_45_day_constant(self):
        now = datetime(2026, 9, 20, 12)
        self.assertAlmostEqual(
            recency_score(now - timedelta(days=45), now),
            math.exp(-1),
            places=6,
        )
        self.assertEqual(recency_score(None, now), 0)

    def test_scores_are_deterministic_bounded_and_explained(self):
        now = datetime(2026, 9, 20, 12)
        with self.Session() as db:
            db.add_all(
                [
                    Person(id="sarah", name="Sarah"),
                    Person(id="maya", name="Maya"),
                    Relationship(
                        id="intro-sarah-maya",
                        source_type="person",
                        source_id="sarah",
                        target_type="person",
                        target_id="maya",
                        type="offered_intro",
                        strength=0.8,
                        evidence="Sarah offered an introduction.",
                    ),
                    InteractionMemory(
                        id="i1",
                        person_id="sarah",
                        person_name="Sarah",
                        transcript="I can introduce you.",
                        happened_at=now - timedelta(days=2),
                    ),
                    GraphEvidence(
                        id="e1",
                        entity_type="relationship",
                        entity_id="intro-sarah-maya",
                        evidence_type="meeting",
                        evidence_id="m143",
                        event_type="offered_intro",
                        excerpt="I can introduce you to Maya.",
                        confidence=0.95,
                    ),
                ]
            )
            db.commit()
            relationship = db.get(Relationship, "intro-sarah-maya")
            first = score_relationship(db, relationship, now=now)
            second = score_relationship(db, relationship, now=now)
            self.assertEqual(first, second)
            for key in ("relationship_strength", "confidence", "intro_probability"):
                self.assertGreaterEqual(first[key], 0)
                self.assertLessEqual(first[key], 1)
            self.assertEqual(first["interaction_count"], 1)
            self.assertEqual(first["last_interaction_days"], 2)
            self.assertGreater(first["intro_probability"], 0.6)
            self.assertIn("explicit introduction offer", " ".join(first["explanation"]["intro_probability"]))
            self.assertEqual(first["evidence"][0]["id"], "m143")


if __name__ == "__main__":
    unittest.main()
