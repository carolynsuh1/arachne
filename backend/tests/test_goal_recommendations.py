import json
import unittest
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Goal, GoalPlan, InteractionMemory, Person, RecommendationSnapshot
from app.services.graph_mutation import apply_confirmed_observation
from app.services.recommendations import rank_people_for_goal, save_ranking_snapshot


class GoalRecommendationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)

    def tearDown(self):
        self.engine.dispose()

    def test_goal_relevance_and_intro_offer_create_before_after_reranking(self):
        now = datetime(2026, 9, 20, 9)
        transcript = (
            "I'm not doing robotics anymore, but my friend Maya works on manipulation models. "
            "You should talk to her. I can introduce you—send me a message tomorrow."
        )
        with self.Session() as db:
            db.add_all(
                [
                    Goal(id="goal", text="Get involved in embodied AI research."),
                    GoalPlan(
                        goal_id="goal",
                        summary="Find a reachable embodied AI research path.",
                        subgoals_json=json.dumps(
                            [{"text": "Meet a robot manipulation researcher", "why": "project access"}]
                        ),
                        needed_connections_json=json.dumps(
                            [{"kind": "embodied AI researcher", "query": "robot manipulation", "why": "research"}]
                        ),
                    ),
                    Person(
                        id="sarah",
                        name="Sarah",
                        bio="Robotics researcher and trusted mentor.",
                        interests=json.dumps(["robotics"]),
                        skills=json.dumps(["introductions"]),
                    ),
                    Person(
                        id="maya",
                        name="Maya",
                        bio="Embodied AI researcher working on manipulation models.",
                        interests=json.dumps(["embodied AI", "robot manipulation"]),
                        skills=json.dumps(["manipulation models"]),
                    ),
                    InteractionMemory(
                        id="old-sarah",
                        person_id="sarah",
                        person_name="Sarah",
                        transcript="Discussed research.",
                        happened_at=now - timedelta(days=5),
                    ),
                ]
            )
            db.commit()
            save_ranking_snapshot(
                db, "goal", "baseline", "demo_baseline", "demo", now=now - timedelta(minutes=1)
            )
            baseline = {
                item["person_id"]: item
                for item in rank_people_for_goal(db, "goal", include_deltas=False)
            }

            db.add(
                InteractionMemory(
                    id="new-sarah",
                    person_id="sarah",
                    person_name="Sarah",
                    transcript=transcript,
                    happened_at=now,
                )
            )
            db.flush()
            apply_confirmed_observation(
                db,
                source_person_id="sarah",
                transcript=transcript,
                cards=[],
                introductions=[
                    {
                        "name": "Maya",
                        "existing_person_id": "maya",
                        "affiliation": "manipulation models",
                        "context": "Sarah offered to introduce Maya.",
                    }
                ],
                provenance_type="meeting",
                provenance_id="meeting-143",
                interaction_id="new-sarah",
                goal_id="goal",
                happened_at=now,
            )
            db.commit()

            after = {
                item["person_id"]: item for item in rank_people_for_goal(db, "goal")
            }
            self.assertGreater(
                after["maya"]["intro_probability"],
                baseline["maya"]["intro_probability"],
            )
            self.assertGreater(after["maya"]["score"], baseline["maya"]["score"])
            self.assertLessEqual(after["maya"]["rank"], baseline["maya"]["rank"])
            self.assertEqual(after["maya"]["rank"], 1)
            self.assertIn("Ask Sarah", after["maya"]["next_action"])
            self.assertIsNotNone(after["maya"]["score_delta"])
            self.assertGreaterEqual(
                db.query(RecommendationSnapshot)
                .filter(RecommendationSnapshot.person_id == "maya")
                .count(),
                3,
            )


if __name__ == "__main__":
    unittest.main()
