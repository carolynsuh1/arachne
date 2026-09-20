from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Goal
from ..pipeline.goal_view import build_goal_view
from ..schemas import GoalCreate, GoalOut, GraphOut

router = APIRouter(prefix="/goals", tags=["goals"])


@router.post("", response_model=GoalOut)
def create_goal(payload: GoalCreate, db: Session = Depends(get_db)):
    goal = Goal(
        id=str(uuid4()),
        text=payload.text.strip(),
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.get("", response_model=list[GoalOut])
def list_goals(db: Session = Depends(get_db)):
    return db.query(Goal).order_by(Goal.created_at.desc()).all()


@router.get("/{goal_id}/graph", response_model=GraphOut)
def goal_graph(
    goal_id: str,
    person_ids: str | None = Query(None, max_length=8000, description="Comma-separated person ids to score instead of the whole network."),
    db: Session = Depends(get_db),
):
    ids = None
    if person_ids is not None:
        ids = [item for item in (part.strip() for part in person_ids.split(",")) if item][:100]
    graph = build_goal_view(db, goal_id, ids)
    if graph is None:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return graph
