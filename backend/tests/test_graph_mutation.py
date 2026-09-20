import json
import unittest
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    GraphEvidence,
    GraphMutation,
    InteractionMemory,
    Person,
    Relationship,
    Reminder,
)
from app.services.graph_mutation import apply_confirmed_observation


TRANSCRIPT = (
    "I'm not doing robotics anymore, but my friend Maya works on manipulation models. "
    "You should talk to her. I can introduce you—send me a message tomorrow."
)


class GraphMutationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)

    def tearDown(self):
        self.engine.dispose()

    def test_confirmed_observation_mutates_with_provenance_and_is_idempotent(self):
        happened_at = datetime(2026, 9, 20, 9)
        with self.Session() as db:
            db.add_all(
                [
                    Person(
                        id="sarah",
                        name="Sarah",
                        bio="Sarah is a robotics researcher.",
                        interests=json.dumps(["robotics", "mentoring"]),
                        skills="[]",
                    ),
                    Person(
                        id="maya",
                        name="Maya",
                        bio="Works on manipulation models.",
                        interests=json.dumps(["embodied AI"]),
                        skills="[]",
                    ),
                    InteractionMemory(
                        id="interaction-1",
                        person_id="sarah",
                        person_name="Sarah",
                        transcript=TRANSCRIPT,
                        happened_at=happened_at,
                    ),
                ]
            )
            db.commit()
            result = apply_confirmed_observation(
                db,
                source_person_id="sarah",
                transcript=TRANSCRIPT,
                cards=[],
                introductions=[
                    {
                        "name": "Maya",
                        "affiliation": "manipulation models",
                        "context": "Sarah recommended Maya.",
                        "existing_person_id": "maya",
                    }
                ],
                provenance_type="meeting",
                provenance_id="meeting-143",
                interaction_id="interaction-1",
                happened_at=happened_at,
            )
            db.commit()

            relationship = db.get(Relationship, "intro-sarah-maya")
            self.assertEqual(relationship.type, "offered_intro")
            self.assertGreater(relationship.intro_probability, 0.6)
            sarah = db.get(Person, "sarah")
            self.assertNotIn("robotics", sarah.interests.casefold())
            self.assertNotIn("robotics researcher", sarah.bio.casefold())
            evidence = db.query(GraphEvidence).filter(
                GraphEvidence.entity_id == relationship.id
            ).one()
            self.assertEqual(evidence.evidence_type, "meeting")
            self.assertEqual(evidence.evidence_id, "meeting-143")
            self.assertEqual(evidence.event_type, "offered_intro")
            self.assertEqual(db.query(Reminder).count(), 1)
            self.assertTrue(
                {"UPDATE_PERSON_CONTEXT", "ADD_EDGE", "ADD_COMMITMENT"}
                <= {item["operation"] for item in result["mutations"]}
            )

            mutation_count = db.query(GraphMutation).count()
            evidence_count = db.query(GraphEvidence).count()
            repeated = apply_confirmed_observation(
                db,
                source_person_id="sarah",
                transcript=TRANSCRIPT,
                cards=[],
                introductions=[
                    {
                        "name": "Maya",
                        "existing_person_id": "maya",
                        "affiliation": "",
                        "context": "",
                    }
                ],
                provenance_type="meeting",
                provenance_id="meeting-143",
                interaction_id="interaction-1",
                happened_at=happened_at,
            )
            self.assertTrue(repeated["idempotent"])
            self.assertEqual(db.query(GraphMutation).count(), mutation_count)
            self.assertEqual(db.query(GraphEvidence).count(), evidence_count)


if __name__ == "__main__":
    unittest.main()
