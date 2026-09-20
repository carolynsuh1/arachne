"""Person-linked research and evidence-backed resume history in SQLite."""
import hashlib
import io
import json
import os
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from pypdf import PdfReader
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..database import get_db
from ..models import Person, ResearchBrief, ResumeRecord

router = APIRouter(prefix="/person-data", tags=["person-data"])


def person_or_404(db, person_id):
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")
    return person


def normalized(name):
    return " ".join(name.casefold().split())


class PersonInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)


@router.get("")
def people(db: Session = Depends(get_db)):
    return [{"id": p.id, "name": p.name} for p in db.query(Person).order_by(Person.name).all()]


@router.post("")
def create_person(payload: PersonInput, db: Session = Depends(get_db)):
    name = " ".join(payload.name.split())
    if not name:
        raise HTTPException(422, "Enter a name")
    # Same names are ambiguous: require selection, never silently merge people.
    if any(normalized(p.name) == normalized(name) for p in db.query(Person).all()):
        raise HTTPException(409, "A person with this name exists. Select their record before saving.")
    person = Person(id=str(uuid4()), name=name)
    db.add(person)
    db.commit()
    return {"id": person.id, "name": person.name}


@router.get("/{person_id}")
def history(person_id: str, db: Session = Depends(get_db)):
    person = person_or_404(db, person_id)
    def records(model):
        return [{"id": row.id, "created_at": row.created_at.isoformat(), "result": json.loads(row.result_json)}
                for row in db.query(model).filter_by(person_id=person_id).order_by(model.created_at.desc()).all()]
    return {"person": {"id": person.id, "name": person.name},
            "research": records(ResearchBrief), "resumes": records(ResumeRecord)}


@router.post("/{person_id}/research/{brief_id}")
def attach_research(person_id: str, brief_id: str, db: Session = Depends(get_db)):
    person = person_or_404(db, person_id)
    brief = db.get(ResearchBrief, brief_id)
    if not brief:
        raise HTTPException(404, "Brief not found")
    if brief.person_id and brief.person_id != person_id:
        raise HTTPException(409, "This brief already belongs to another person")
    if normalized(json.loads(brief.result_json).get("person", "")) != normalized(person.name):
        raise HTTPException(422, "Brief name does not match this person")
    brief.person_id = person_id
    db.commit()
    return {"saved": True, "person_id": person_id}


def extract_pdf(data):
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted or len(reader.pages) > 12:
            raise ValueError("Use an unencrypted PDF with at most 12 pages.")
        lines = []
        for number, page in enumerate(reader.pages, 1):
            for line in (page.extract_text() or "").splitlines():
                text = line.replace("\x7f", "•").strip()
                if text:
                    lines.append({"id": f"L{len(lines)+1}", "page": number, "text": text})
        size = sum(len(line["text"]) for line in lines)
        if not 50 <= size <= 70000:
            raise ValueError("PDF needs readable text (50–70,000 characters). Scanned PDFs need OCR.")
        return {"sha256": hashlib.sha256(data).hexdigest(), "pageCount": len(reader.pages), "lines": lines}
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except Exception as error:
        raise HTTPException(422, "Could not read this PDF") from error


@router.post("/{person_id}/resume")
async def upload_resume(person_id: str, request: Request, db: Session = Depends(get_db)):
    person = person_or_404(db, person_id)
    if request.headers.get("content-type", "").split(";")[0] != "application/pdf":
        raise HTTPException(415, "Upload a PDF")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 10_000_000:
            raise HTTPException(413, "PDF must be under 10 MB")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(422, "Invalid PDF")
    digest = hashlib.sha256(data).hexdigest()
    prior = db.query(ResumeRecord).filter_by(person_id=person_id, sha256=digest).first()
    if prior:
        return {"id": prior.id, "result": json.loads(prior.result_json), "cached": True}
    document = await run_in_threadpool(extract_pdf, bytes(data))
    url = os.getenv("RESEARCH_SERVICE_URL", "http://127.0.0.1:8791").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=260) as client:
            response = await client.post(url + "/api/resume", json=document)
        response.raise_for_status()
        result = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(502, "Resume parsing failed. Check the research service and try again.") from error
    if result.get("status") != "ready":
        raise HTTPException(502, "Parser did not return a completed resume")
    parsed_name = ((result.get("profile") or {}).get("name") or {}).get("value")
    if not parsed_name or normalized(parsed_name) != normalized(person.name):
        raise HTTPException(422, "Resume name does not match the selected person. Check the document and person before saving.")
    record = ResumeRecord(id=str(uuid4()), person_id=person_id, sha256=digest, result_json=json.dumps(result))
    db.add(record)
    db.commit()
    return {"id": record.id, "result": result, "cached": False}
