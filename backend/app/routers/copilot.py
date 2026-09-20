from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.copilot import build_copilot_turn, build_feedback, build_practice_turn

router = APIRouter(prefix="/copilot", tags=["copilot"])

class Message(BaseModel):
    role: Literal["user","assistant"]
    content: str = Field(min_length=1,max_length=10_000)
class CopilotTurn(BaseModel):
    question: str = Field(min_length=1,max_length=2_000)
    history: list[Message] = Field(default_factory=list,max_length=20)
    # Optional: only consider these people (e.g. one user's own map inside the shared network).
    person_ids: list[str] | None = Field(default=None,max_length=100)
class PracticeTurn(BaseModel):
    person_id: str
    message: str = Field(min_length=1,max_length=2_000)
    history: list[Message] = Field(default_factory=list,max_length=30)
class FeedbackRequest(BaseModel):
    person_id: str
    transcript: list[Message] = Field(min_length=1,max_length=60)

@router.post("/turn")
def copilot_turn(payload: CopilotTurn, db: Session=Depends(get_db)):
    return build_copilot_turn(db,payload.question.strip(),[m.model_dump() for m in payload.history],payload.person_ids)
@router.post("/practice/turn")
def practice_turn(payload: PracticeTurn, db: Session=Depends(get_db)):
    result=build_practice_turn(db,payload.person_id,payload.message.strip(),[m.model_dump() for m in payload.history])
    if result is None: raise HTTPException(404,"Person not found")
    return result
@router.post("/practice/feedback")
def practice_feedback(payload: FeedbackRequest, db: Session=Depends(get_db)):
    result=build_feedback(db,payload.person_id,[m.model_dump() for m in payload.transcript])
    if result is None: raise HTTPException(404,"Person not found")
    return result
