from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..pipeline.extract import extract_and_save
from ..pipeline.llm import LLMError

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


class ExtractIn(BaseModel):
    text: str = Field(min_length=1)
    source_doc: str = ""


@router.post("/extract")
def extract_from_text(payload: ExtractIn, db: Session = Depends(get_db)):
    """Step 5: messy text → SQLite people/orgs/relationships via Terra."""
    try:
        return extract_and_save(db, payload.text, payload.source_doc)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
