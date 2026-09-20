"""Coffee-chat research bridge; does not modify network entities."""
import json
import os
from uuid import uuid4
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Person, ResearchBrief, PersonalProfile

router = APIRouter(prefix="/research", tags=["research"])

class ResearchInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    affiliation: str = Field(min_length=1, max_length=180)
    goal: str = Field(default="Prepare a professional coffee chat about experience, projects and collaboration.", min_length=1, max_length=700)
    profileUrl: str | None = Field(default=None, max_length=1500)
    viewer_profile_id: str | None = Field(default=None, max_length=36)
    person_id: str | None = Field(default=None, max_length=200)

@router.post("")
async def research_person(payload: ResearchInput, db: Session = Depends(get_db)):
    if payload.person_id:
        person = db.get(Person, payload.person_id)
        if not person:
            raise HTTPException(404, "Person not found")
        if person.name.casefold().strip() != payload.name.casefold().strip():
            raise HTTPException(422, "The research name must match the selected person.")
    url = os.getenv("RESEARCH_SERVICE_URL", "http://127.0.0.1:8791").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=105) as client:
            response = await client.post(url + "/api/research", json={**payload.model_dump(exclude={"person_id", "viewer_profile_id"}), "viewerProfile": load_viewer(db, payload.viewer_profile_id)})
    except httpx.RequestError:
        raise HTTPException(503, "Research service unavailable. Start the research-service Node process.")
    if response.status_code != 200:
        raise HTTPException(response.status_code if response.status_code in (400,422,429,502,503) else 502, "Research could not finish. Check provider availability or try again.")
    try:
        result = response.json()
    except ValueError:
        raise HTTPException(502, "Research service returned an invalid response.")
    if result.get("status") == "ready":
        record = ResearchBrief(id=str(uuid4()), person_id=payload.person_id, result_json=json.dumps(result))
        db.add(record)
        db.commit()
        result["brief_id"] = record.id
    return result

@router.get("/people/{person_id}")
def latest_research(person_id: str, db: Session = Depends(get_db)):
    if not db.get(Person, person_id):
        raise HTTPException(404, "Person not found")
    record = db.query(ResearchBrief).filter_by(person_id=person_id).order_by(ResearchBrief.created_at.desc()).first()
    if not record:
        return None
    return {**json.loads(record.result_json), "brief_id": record.id, "saved": True}


def load_viewer(db, profile_id):
    if not profile_id:
        return {}
    profile = db.get(PersonalProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Save your About me profile first")
    data = json.loads(profile.data_json)
    imported = data.pop("linkedin", None)
    if imported:
        detail = {"about": imported.get("about", ""), "experience": imported.get("experience", []), "education": imported.get("education", [])}
        data["professionalBackground"] = json.dumps(detail, ensure_ascii=False)[:14000]
        roles = [" / ".join(filter(None, [x.get("position"), x.get("company")])) for x in imported.get("experience", [])]
        schools = [" / ".join(filter(None, [x.get("school"), x.get("degree")])) for x in imported.get("education", [])]
        context = "\n".join(filter(None, [imported.get("headline"), "Experience: " + "; ".join(roles) if roles else "", "Education: " + "; ".join(schools) if schools else ""]))
        data["background"] = (data.get("background", "") + "\n" + context).strip()[:1200]
    return data


class PersonalizeInput(BaseModel):
    viewer_profile_id: str = Field(min_length=1, max_length=36)
    goal: str = Field(min_length=1, max_length=700)


@router.post("/briefs/{brief_id}/questions")
async def personalize_brief(brief_id: str, payload: PersonalizeInput, db: Session = Depends(get_db)):
    brief = db.get(ResearchBrief, brief_id)
    if not brief:
        raise HTTPException(404, "Brief not found")
    result = json.loads(brief.result_json)
    viewer = load_viewer(db, payload.viewer_profile_id)
    url = os.getenv("RESEARCH_SERVICE_URL", "http://127.0.0.1:8791").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=100) as client:
            response = await client.post(url + "/api/questions", json={"name": result["person"], "affiliation": result.get("affiliation", "Unknown"), "goal": payload.goal, "viewerProfile": viewer, "facts": result.get("facts", [])})
        response.raise_for_status()
        questions = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(502, "Could not personalize questions. Try again.") from error
    result.update(questions)
    result["goal"] = payload.goal
    result.pop("brief_id", None)
    result.pop("saved", None)
    record = ResearchBrief(id=str(uuid4()), person_id=brief.person_id, result_json=json.dumps(result))
    db.add(record)
    db.commit()
    return {**result, "brief_id": record.id, "saved": True}
