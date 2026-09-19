from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..agents.knowledge_graph import build_graph
from ..database import get_db
from ..schemas import GraphOut

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("", response_model=GraphOut)
def get_graph(db: Session = Depends(get_db)):
    """Full contact map (step 2). Goal-specific views belong to teammates (step 3)."""
    return build_graph(db)
