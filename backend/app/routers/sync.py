from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..ingest import NetworkNotEmpty, replace_network
from ..models import Organization, Person, Relationship, SyncState
from ..schemas import SyncOut
from ..seed import load_sample_payload, seed_if_empty

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


def startup_sync(db: Session) -> None:
    seed_if_empty(db)
