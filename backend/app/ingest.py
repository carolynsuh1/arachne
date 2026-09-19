import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .models import Organization, Person, Relationship, SyncState


def _as_json_list(value) -> str:
    if value is None:
        return "[]"
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return json.dumps(parsed)
        except json.JSONDecodeError:
            return json.dumps([item.strip() for item in value.split(",") if item.strip()])
        return json.dumps([value])
    if isinstance(value, list):
        return json.dumps(value)
    return json.dumps([str(value)])


def replace_network(db: Session, payload: dict, source: str, detail: str) -> dict:
    db.query(Relationship).delete()
    db.query(Person).delete()
    db.query(Organization).delete()

    for person in payload.get("people", []):
        db.add(
            Person(
                id=str(person["id"]),
                name=person["name"],
                bio=person.get("bio") or "",
                interests=_as_json_list(person.get("interests")),
                skills=_as_json_list(person.get("skills")),
            )
        )

    for org in payload.get("organizations", []):
        db.add(
            Organization(
                id=str(org["id"]),
                name=org["name"],
                type=org.get("type") or "",
                description=org.get("description") or "",
            )
        )

    for rel in payload.get("relationships", []):
        db.add(
            Relationship(
                id=str(rel["id"]),
                source_type=rel["source_type"],
                source_id=str(rel["source_id"]),
                target_type=rel["target_type"],
                target_id=str(rel["target_id"]),
                type=rel["type"],
                strength=float(rel.get("strength") or 0.5),
                evidence=rel.get("evidence") or "",
            )
        )

    state = db.get(SyncState, 1)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if state is None:
        state = SyncState(id=1, source=source, detail=detail, synced_at=now)
        db.add(state)
    else:
        state.source = source
        state.detail = detail
        state.synced_at = now

    db.commit()
    return {
        "source": source,
        "detail": detail,
        "people": db.query(Person).count(),
        "organizations": db.query(Organization).count(),
        "relationships": db.query(Relationship).count(),
        "synced_at": state.synced_at,
    }
