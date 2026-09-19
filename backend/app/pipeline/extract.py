"""Step 5: LLM extracts structured network rows from messy text.

Inserts/updates SQLite. Never deletes the whole network.
"""

from __future__ import annotations

import json
import re

from sqlalchemy.orm import Session

from ..models import Organization, Person, PersonProfile, Relationship
from .llm import call_terra, parse_json_object

EXTRACT_PROMPT = """
You extract a personal network from unstructured notes, resumes, emails, or club docs.

Rules:
- Only extract people, organizations, and relationships that are clearly in the text.
- Do not invent names, labs, or jobs that are not written.
- ids must be short slugs like p-maya, o-bair, r-maya-bair.
- source_type and target_type must be "person" or "organization".
- relationship type must be one of: knows, friend_of, member_of, works_at, researches, interested_in, introduced_by, worked_with, worked_on.
- interests and skills are arrays of short strings.
- location is the most specific geographic area clearly stated for the person.

Return JSON only, no markdown, matching:
{
  "people": [{"id": "", "name": "", "bio": "", "interests": [], "skills": [], "location": ""}],
  "organizations": [{"id": "", "name": "", "type": "lab|club|company|university|resource", "description": ""}],
  "relationships": [{
    "id": "",
    "source_type": "person",
    "source_id": "",
    "target_type": "organization",
    "target_id": "",
    "type": "member_of",
    "strength": 0.5,
    "evidence": "short quote or reason from the text"
  }]
}
""".strip()


def extract_entities(raw_text: str, source_doc: str = "") -> dict:
    user_input = raw_text.strip()
    if source_doc:
        user_input = f"Source file: {source_doc}\n\n{user_input}"
    raw = call_terra(EXTRACT_PROMPT, user_input)
    parsed = parse_json_object(raw)
    return _normalize(parsed, source_doc)


def save_entities(db: Session, payload: dict) -> dict:
    for person in payload.get("people", []):
        _upsert_person(db, person)
    for org in payload.get("organizations", []):
        _upsert_org(db, org)
    for rel in payload.get("relationships", []):
        _upsert_rel(db, rel)
    db.commit()
    return {
        "people": len(payload.get("people") or []),
        "organizations": len(payload.get("organizations") or []),
        "relationships": len(payload.get("relationships") or []),
    }


def extract_and_save(db: Session, raw_text: str, source_doc: str = "") -> dict:
    payload = extract_entities(raw_text, source_doc)
    saved = save_entities(db, payload)
    return {"provider": "terra", "source_doc": source_doc, **saved, "extracted": payload}


def _normalize(parsed: dict, source_doc: str) -> dict:
    people = []
    for item in parsed.get("people") or []:
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        people.append(
            {
                "id": _id(item.get("id"), "p", name),
                "name": name,
                "bio": str(item.get("bio") or "").strip(),
                "interests": _str_list(item.get("interests")),
                "skills": _str_list(item.get("skills")),
                "location": str(item.get("location") or "").strip(),
            }
        )

    orgs = []
    for item in parsed.get("organizations") or []:
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        orgs.append(
            {
                "id": _id(item.get("id"), "o", name),
                "name": name,
                "type": str(item.get("type") or "").strip(),
                "description": str(item.get("description") or "").strip(),
            }
        )

    rels = []
    for item in parsed.get("relationships") or []:
        source_id = str(item.get("source_id") or "").strip()
        target_id = str(item.get("target_id") or "").strip()
        rel_type = str(item.get("type") or "knows").strip()
        if not source_id or not target_id:
            continue
        evidence = str(item.get("evidence") or "").strip()
        if source_doc and source_doc not in evidence:
            evidence = f"{evidence} ({source_doc})".strip()
        rels.append(
            {
                "id": _id(item.get("id"), "r", f"{source_id}-{rel_type}-{target_id}"),
                "source_type": _entity_type(item.get("source_type"), source_id, people, orgs),
                "source_id": source_id,
                "target_type": _entity_type(item.get("target_type"), target_id, people, orgs),
                "target_id": target_id,
                "type": rel_type,
                "strength": _strength(item.get("strength")),
                "evidence": evidence,
            }
        )

    return {"people": people, "organizations": orgs, "relationships": rels}


def _id(raw, prefix: str, fallback: str) -> str:
    value = str(raw or "").strip()
    if value:
        return value
    slug = re.sub(r"[^a-z0-9]+", "-", fallback.lower()).strip("-")
    return f"{prefix}-{slug or 'unknown'}"


def _str_list(value) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [part.strip() for part in value.split(",") if part.strip()]
    return []


def _strength(value) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.5
    return max(0.0, min(1.0, number))


def _entity_type(raw, entity_id: str, people: list, orgs: list) -> str:
    value = str(raw or "").strip().lower()
    if value in {"person", "organization"}:
        return value
    if any(row["id"] == entity_id for row in people):
        return "person"
    if any(row["id"] == entity_id for row in orgs):
        return "organization"
    return "person"


def _as_json_list(values: list[str]) -> str:
    return json.dumps(values)


def _merge_lists(existing_json: str, incoming: list[str]) -> str:
    try:
        current = json.loads(existing_json or "[]")
    except json.JSONDecodeError:
        current = []
    if not isinstance(current, list):
        current = []
    merged = list(dict.fromkeys([str(item) for item in current] + incoming))
    return json.dumps(merged)


def _upsert_person(db: Session, person: dict) -> None:
    row = db.get(Person, person["id"])
    if row is None:
        db.add(
            Person(
                id=person["id"],
                name=person["name"],
                bio=person["bio"],
                interests=_as_json_list(person["interests"]),
                skills=_as_json_list(person["skills"]),
            )
        )
    else:
        if person["name"]:
            row.name = person["name"]
        if person["bio"] and len(person["bio"]) > len(row.bio or ""):
            row.bio = person["bio"]
        row.interests = _merge_lists(row.interests, person["interests"])
        row.skills = _merge_lists(row.skills, person["skills"])

    profile = db.get(PersonProfile, person["id"])
    if profile is None:
        db.add(PersonProfile(person_id=person["id"], location=person["location"]))
    elif person["location"]:
        profile.location = person["location"]


def _upsert_org(db: Session, org: dict) -> None:
    row = db.get(Organization, org["id"])
    if row is None:
        db.add(
            Organization(
                id=org["id"],
                name=org["name"],
                type=org["type"],
                description=org["description"],
            )
        )
        return
    if org["name"]:
        row.name = org["name"]
    if org["type"] and not row.type:
        row.type = org["type"]
    if org["description"] and len(org["description"]) > len(row.description or ""):
        row.description = org["description"]


def _upsert_rel(db: Session, rel: dict) -> None:
    row = db.get(Relationship, rel["id"])
    if row is None:
        db.add(
            Relationship(
                id=rel["id"],
                source_type=rel["source_type"],
                source_id=rel["source_id"],
                target_type=rel["target_type"],
                target_id=rel["target_id"],
                type=rel["type"],
                strength=rel["strength"],
                evidence=rel["evidence"],
            )
        )
        return
    row.strength = max(row.strength, rel["strength"])
    if rel["evidence"] and rel["evidence"] not in (row.evidence or ""):
        row.evidence = f"{row.evidence} {rel['evidence']}".strip()
