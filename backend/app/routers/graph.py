from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..agents.knowledge_graph import build_graph
from ..database import get_db
from ..models import Relationship
from ..schemas import GraphOut
from ..services.relationship_scoring import score_relationship

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("", response_model=GraphOut)
def get_graph(db: Session = Depends(get_db)):
    """Full contact map (step 2). Goal-specific views belong to teammates (step 3)."""
    return build_graph(db)


@router.get("/relationships/{relationship_id}")
def explain_relationship(relationship_id: str, db: Session = Depends(get_db)):
    relationship = db.get(Relationship, relationship_id)
    if relationship is None:
        raise HTTPException(404, "Relationship not found.")
    return {
        "id": relationship.id,
        "source_id": relationship.source_id,
        "target_id": relationship.target_id,
        "type": relationship.type,
        **score_relationship(db, relationship),
    }
