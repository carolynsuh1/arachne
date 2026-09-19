from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..dropbox_client import DropboxError, download_network, get_access_token
from ..ingest import replace_network
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


@router.post("/dropbox", response_model=SyncOut)
def sync_dropbox(db: Session = Depends(get_db)):
    if not get_access_token():
        raise HTTPException(
            status_code=400,
            detail="Set DROPBOX_ACCESS_TOKEN in backend/.env to sync from Dropbox.",
        )
    try:
        payload = download_network()
        result = replace_network(
            db,
            payload,
            source="dropbox",
            detail="Loaded people, organizations, and relationships from Dropbox.",
        )
        return result
    except DropboxError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/sample", response_model=SyncOut)
def sync_sample(db: Session = Depends(get_db)):
    result = replace_network(
        db,
        load_sample_payload(),
        source="seed",
        detail="Reloaded the local sample JSON files.",
    )
    return result


def startup_sync(db: Session) -> None:
    if get_access_token():
        try:
            payload = download_network()
            replace_network(
                db,
                payload,
                source="dropbox",
                detail="Loaded people, organizations, and relationships from Dropbox on startup.",
            )
            return
        except DropboxError:
            seed_if_empty(db)
            return
    seed_if_empty(db)
