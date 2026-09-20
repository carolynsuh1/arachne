import json
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..ingest import NetworkNotEmpty, replace_network
from ..models import (
    Goal,
    GoalPlan,
    GraphEvidence,
    GraphMutation,
    InteractionMemory,
    Organization,
    Person,
    RecommendationSnapshot,
    Relationship,
    SyncState,
)
from ..schemas import SyncOut
from ..seed import load_sample_payload, seed_if_empty
from ..services.recommendations import save_ranking_snapshot

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/status", response_model=SyncOut)
def sync_status(db: Session = Depends(get_db)):
    state = db.get(SyncState, 1)
    if state is None:
        raise HTTPException(status_code=404, detail="Network data has not been loaded yet.")
    return SyncOut(
        source=state.source,
        detail=state.detail,
        people=db.query(Person).count(),
        organizations=db.query(Organization).count(),
        relationships=db.query(Relationship).count(),
        synced_at=state.synced_at,
    )


@router.post("/sample", response_model=SyncOut)
def sync_sample(
    force: bool = Query(False),
    db: Session = Depends(get_db),
):
    try:
        return replace_network(
            db,
            load_sample_payload(),
            source="seed",
            detail="Loaded local sample JSON. Will not overwrite an existing network unless force=true.",
            force=force,
        )
    except NetworkNotEmpty as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/hackmit-demo")
def initialize_hackmit_demo(db: Session = Depends(get_db)):
    """Idempotently reset only the namespaced HackMIT demo records."""
    path = Path(__file__).resolve().parent.parent.parent / "sample_data" / "hackmit_demo.json"
    payload = json.loads(path.read_text())
    goal_payload = payload["goal"]

    for person_payload in payload["people"]:
        person = db.get(Person, person_payload["id"])
        if person is None:
            person = Person(id=person_payload["id"], name=person_payload["name"])
            db.add(person)
        person.name = person_payload["name"]
        person.bio = person_payload["bio"]
        person.interests = json.dumps(person_payload["interests"])
        person.skills = json.dumps(person_payload["skills"])

    goal = db.get(Goal, goal_payload["id"])
    if goal is None:
        goal = Goal(id=goal_payload["id"], text=goal_payload["text"])
        db.add(goal)
    goal.text = goal_payload["text"]
    plan = db.get(GoalPlan, goal.id)
    if plan is None:
        plan = GoalPlan(goal_id=goal.id)
        db.add(plan)
    plan.summary = goal_payload["summary"]
    plan.subgoals_json = json.dumps(goal_payload["subgoals"])
    plan.needed_connections_json = json.dumps(goal_payload["needed_connections"])
    plan.provider = "demo"

    demo_relationship_ids = {
        payload["relationship"]["id"],
        "intro-demo-sarah-demo-maya",
    }
    db.query(GraphEvidence).filter(
        GraphEvidence.entity_id.in_(demo_relationship_ids | {"demo-sarah", "demo-maya"})
    ).delete(synchronize_session=False)
    db.query(GraphMutation).filter(
        GraphMutation.entity_id.in_(demo_relationship_ids | {"demo-sarah", "demo-maya"})
    ).delete(synchronize_session=False)
    db.query(RecommendationSnapshot).filter(
        RecommendationSnapshot.goal_id == goal.id
    ).delete(synchronize_session=False)
    db.query(Relationship).filter(
        Relationship.id.in_(demo_relationship_ids)
    ).delete(synchronize_session=False)

    rel_payload = payload["relationship"]
    db.add(
        Relationship(
            id=rel_payload["id"],
            source_type="person",
            source_id=rel_payload["source_id"],
            target_type="person",
            target_id=rel_payload["target_id"],
            type=rel_payload["type"],
            strength=rel_payload["strength"],
            relationship_strength=rel_payload["strength"],
            confidence=0.3,
            intro_probability=0.1,
            evidence=rel_payload["evidence"],
        )
    )
    db.add(
        GraphEvidence(
            id="legacy-demo-sarah-maya",
            entity_type="relationship",
            entity_id=rel_payload["id"],
            evidence_type="demo",
            evidence_id="hackmit-baseline",
            event_type="observation",
            excerpt=rel_payload["evidence"],
            confidence=0.5,
        )
    )
    interaction = db.get(InteractionMemory, "demo-interaction-sarah")
    happened_at = datetime.utcnow() - timedelta(days=30)
    if interaction is None:
        interaction = InteractionMemory(
            id="demo-interaction-sarah",
            person_id="demo-sarah",
            person_name="Sarah Kim",
            transcript="Caught up with Sarah about robotics research.",
            happened_at=happened_at,
        )
        db.add(interaction)
    else:
        interaction.happened_at = happened_at
        interaction.transcript = "Caught up with Sarah about robotics research."
    db.flush()
    save_ranking_snapshot(
        db,
        goal.id,
        "hackmit-demo-baseline",
        "demo_baseline",
        "hackmit",
    )
    db.commit()
    return {
        "goal_id": goal.id,
        "sarah_id": "demo-sarah",
        "maya_id": "demo-maya",
        "transcript": payload["transcript"],
    }


def startup_sync(db: Session) -> None:
    seed_if_empty(db)
