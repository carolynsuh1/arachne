import json
import unittest
from datetime import datetime
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import InteractionMemory, Person, Relationship
from app.services.copilot import build_copilot_turn, build_feedback


class CopilotTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        self.Session = sessionmaker(bind=self.engine)
        Base.metadata.create_all(self.engine)
        with self.Session() as db:
            db.add_all(
                [
                    Person(
                        id="p-maya",
                        name="Maya Chen",
                        bio="Robotics student exploring AI agents.",
                        interests=json.dumps(["AI agents", "robot learning"]),
                        skills=json.dumps(["Python"]),
                    ),
                    Person(
                        id="p-kevin",
                        name="Kevin Park",
                        bio="Designer working on community events.",
                        interests=json.dumps(["design"]),
                        skills=json.dumps(["facilitation"]),
                    ),
                    Relationship(
                        id="r-maya-kevin",
                        source_type="person",
                        source_id="p-maya",
                        target_type="person",
                        target_id="p-kevin",
                        type="knows",
                        strength=0.8,
                        evidence="Maya met Kevin at a robotics meetup.",
                    ),
                    InteractionMemory(
                        id="memory-1",
                        person_id="p-maya",
                        person_name="Maya Chen",
                        transcript="Maya offered to share her agent evaluation notes.",
                        happened_at=datetime.now(),
                    ),
                ]
            )
            db.commit()

    def tearDown(self):
        self.engine.dispose()

    @patch.dict("os.environ", {"ELEVENLABS_API_KEY": ""}, clear=False)
    def test_plan_uses_real_graph_ids_and_memory(self):
        with self.Session() as db:
            result = build_copilot_turn(
                db,
                "Who can help me learn about AI agents?",
                [],
            )
        self.assertEqual(result["cited_people"][0]["id"], "p-maya")
        self.assertEqual(result["highlight_events"][0]["node_id"], "person:p-maya")
        self.assertIn("agent evaluation notes", result["spoken_text"])
        edge = next(event for event in result["highlight_events"] if event["type"] == "edge")
        self.assertEqual(edge["edge_id"], "r-maya-kevin")
        self.assertIsNone(result["audio_base64"])

    def test_feedback_has_required_structure(self):
        with self.Session() as db:
            result = build_feedback(
                db,
                "p-maya",
                [{"role": "user", "content": "I build AI agents in Python."}],
            )
        self.assertEqual(
            set(result or {}),
            {
                "topics_connected",
                "missed_opportunity",
                "suggested_follow_up",
                "next_action",
            },
        )


if __name__ == "__main__":
    unittest.main()
