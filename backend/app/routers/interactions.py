from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import InteractionMemory, Person
from ..schemas import InteractionMemoryCreate, InteractionMemoryOut

router = APIRouter(prefix="/interactions", tags=["interactions"])


@router.post("", response_model=InteractionMemoryOut, status_code=201)
def create_interaction(
    payload: InteractionMemoryCreate, db: Session = Depends(get_db)
):
    person_name = payload.person_name.strip()
    transcript = payload.transcript.strip()
    if not person_name or not transcript:
        raise HTTPException(422, "A person and debrief are required.")

    if payload.person_id:
        person = db.get(Person, payload.person_id)
        if not person:
            raise HTTPException(404, "Person not found")
        if person.name.casefold().strip() != person_name.casefold():
            raise HTTPException(422, "The selected person's name does not match.")

    memory = InteractionMemory(
        id=str(uuid4()),
        person_id=payload.person_id,
        person_name=person_name,
        transcript=transcript,
        happened_at=payload.happened_at,
    )
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return memory


@router.get("", response_model=list[InteractionMemoryOut])
def list_interactions(
    person_id: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(InteractionMemory)
    if person_id:
        query = query.filter(InteractionMemory.person_id == person_id)
    return query.order_by(
        InteractionMemory.happened_at.desc(),
        InteractionMemory.created_at.desc(),
    ).limit(limit).all()
