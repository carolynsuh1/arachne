import json
import os
import httpx
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import PersonalProfile

router = APIRouter(prefix="/my-profile", tags=["personal-profile"])


class LinkedInEntry(BaseModel):
    company: str = Field(default="", max_length=500)
    position: str = Field(default="", max_length=500)
    summary: str = Field(default="", max_length=20000)
    school: str = Field(default="", max_length=500)
    degree: str = Field(default="", max_length=500)
    field_of_study: str = Field(default="", max_length=500)
    starts_at: str = Field(default="", max_length=100)
    ends_at: str = Field(default="", max_length=100)


class LinkedInData(BaseModel):
    url: str = Field(max_length=1500)
    retrievedAt: str = Field(max_length=100)
    name: str = Field(default="", max_length=120)
    headline: str = Field(default="", max_length=1000)
    about: str = Field(default="", max_length=20000)
    experience: list[LinkedInEntry] = Field(default_factory=list, max_length=100)
    education: list[LinkedInEntry] = Field(default_factory=list, max_length=100)


class ImportInput(BaseModel):
    profileUrl: str = Field(min_length=1, max_length=1500)


@router.post("/import-linkedin")
async def import_linkedin(payload: ImportInput):
    url = os.getenv("RESEARCH_SERVICE_URL", "http://127.0.0.1:8791").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=105) as client:
            response = await client.post(url + "/api/self-profile", json=payload.model_dump())
        if response.status_code != 200:
            raise HTTPException(502, "LinkedIn import could not finish. Check the URL and provider availability; retry to check an existing scrape.")
        data = response.json()
        imported = LinkedInData(**data["profile"], url=data["url"], retrievedAt=data["retrievedAt"])
        return imported.model_dump()
    except (httpx.HTTPError, ValueError, KeyError) as error:
        raise HTTPException(502, "LinkedIn import is unavailable. You can still enter your details manually.") from error


class ProfileInput(BaseModel):
    name: str = Field(default="", max_length=120)
    school: str = Field(default="", max_length=180)
    background: str = Field(default="", max_length=1200)
    interests: str = Field(default="", max_length=700)
    goals: str = Field(default="", max_length=700)
    contribution: str = Field(default="", max_length=700)
    linkedin: LinkedInData | None = None


@router.get("")
def list_profiles(db: Session = Depends(get_db)):
    return [{"id": record.id, **json.loads(record.data_json)}
            for record in db.query(PersonalProfile).all()]


@router.get("/{profile_id}")
def read_profile(profile_id: UUID, db: Session = Depends(get_db)):
    record = db.get(PersonalProfile, str(profile_id))
    return json.loads(record.data_json) if record else ProfileInput().model_dump()


@router.put("/{profile_id}")
def save_profile(profile_id: UUID, payload: ProfileInput, db: Session = Depends(get_db)):
    data = {key: (value.strip() if isinstance(value, str) else value) for key, value in payload.model_dump().items()}
    record = db.get(PersonalProfile, str(profile_id))
    if record:
        record.data_json = json.dumps(data)
    else:
        db.add(PersonalProfile(id=str(profile_id), data_json=json.dumps(data)))
    db.commit()
    return data
