from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..agents.goal_network import analyze_goal, load_plan
from ..agents.knowledge_graph import build_graph
from ..database import get_db
from ..schemas import GoalCreate, GoalNetworkOut, GraphOut

router = APIRouter(prefix="/agents", tags=["agents"])


@router.post("/goal-network", response_model=GoalNetworkOut)
def run_goal_network_agent(payload: GoalCreate, db: Session = Depends(get_db)):
    """Step 1: decompose a goal. Does not read or write the contact graph."""
    return analyze_goal(db, payload.text)


@router.get("/goal-network/{goal_id}", response_model=GoalNetworkOut)
def get_goal_network_plan(goal_id: str, db: Session = Depends(get_db)):
    plan = load_plan(db, goal_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="No goal plan found.")
    return plan


@router.get("/knowledge-graph", response_model=GraphOut)
def run_knowledge_graph_agent(db: Session = Depends(get_db)):
    """Step 2: full relationship map from SQLite. No goal filtering."""
    return build_graph(db)
