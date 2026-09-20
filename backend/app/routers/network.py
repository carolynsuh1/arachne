from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import InteractionMemory, Organization, Person, PersonProfile, Relationship
from ..pipeline.elastic import ElasticPipelineError, search as elastic_search
from ..schemas import (
    NetworkSearchIn,
    NetworkSearchOut,
    NetworkSearchResult,
    NetworkTrackerOut,
    TrackerGroupOut,
    TrackerPersonOut,
)

router = APIRouter(prefix="/network", tags=["network"])

UNKNOWN_LOCATION = "Unknown"


@router.get("/tracker", response_model=NetworkTrackerOut)
def get_network_tracker(db: Session = Depends(get_db)):
    people = db.query(Person).order_by(Person.name).all()
    organizations = {row.id: row for row in db.query(Organization).all()}
    profiles = {
        row.person_id: row for row in db.query(PersonProfile).all()
    }
    affiliations: dict[str, list[Organization]] = defaultdict(list)

    for rel in db.query(Relationship).all():
        if rel.source_type == "person" and rel.target_type == "organization":
            org = organizations.get(rel.target_id)
            if org is not None:
                affiliations[rel.source_id].append(org)
        elif rel.target_type == "person" and rel.source_type == "organization":
            org = organizations.get(rel.source_id)
            if org is not None:
                affiliations[rel.target_id].append(org)

    tracker_people: list[TrackerPersonOut] = []
    for person in people:
        orgs = affiliations[person.id]
        tracker_people.append(
            TrackerPersonOut(
                id=person.id,
                name=person.name,
                bio=person.bio,
                location=(profiles.get(person.id).location if profiles.get(person.id) else ""),
                companies=_names(orgs, {"company"}),
                clubs=_names(orgs, {"club"}),
                organizations=_names(orgs, None),
            )
        )

    return NetworkTrackerOut(
        people=tracker_people,
        companies=_organization_groups(tracker_people, "companies", "company"),
        clubs=_organization_groups(tracker_people, "clubs", "club"),
        organizations=_all_organization_groups(tracker_people, affiliations),
        locations=_location_groups(tracker_people),
    )


@router.post("/search", response_model=NetworkSearchOut)
def search_network(payload: NetworkSearchIn, db: Session = Depends(get_db)):
    """Retrieve semantic matches, then rank people with local network signals."""
    query = payload.query.strip()
    try:
        retrieved = elastic_search(query)
    except ElasticPipelineError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    people = {person.id: person for person in db.query(Person).all()}
    organizations = {org.id: org for org in db.query(Organization).all()}
    relationships = db.query(Relationship).all()
    latest_interactions = _latest_interactions(db)
    candidates: dict[str, dict[str, object]] = {}
    max_retrieval_score = max((float(item.get("score", 0)) for item in retrieved), default=0.0)

    def include(person_id: str, semantic_score: float, evidence: str) -> None:
        if person_id not in people:
            return
        current = candidates.setdefault(person_id, {"semantic": 0.0, "evidence": []})
        current["semantic"] = max(float(current["semantic"]), semantic_score)
        if evidence not in current["evidence"]:
            current["evidence"].append(evidence)

    for item in retrieved:
        raw_score = float(item.get("score", 0))
        semantic_score = raw_score / max_retrieval_score if max_retrieval_score else 0.0
        entity_id, entity_type = str(item["entity_id"]), str(item["type"])
        if entity_type == "person":
            include(entity_id, semantic_score, "matches your search")
        elif entity_type == "organization" and entity_id in organizations:
            for relationship in relationships:
                person_id = _person_connected_to_organization(relationship, entity_id)
                if person_id:
                    include(person_id, semantic_score * 0.85, f"connected to {organizations[entity_id].name}")

    reconnecting = _is_reconnect_query(query)
    results: list[NetworkSearchResult] = []
    for person_id, candidate in candidates.items():
        person = people[person_id]
        related = [rel for rel in relationships if _relationship_has_person(rel, person_id)]
        relationship_strength = max((max(0.0, min(1.0, rel.strength)) for rel in related), default=0.0)
        last_interaction = latest_interactions.get(person_id)
        recency_score = _recency_score(last_interaction, reconnecting)
        semantic_score = float(candidate["semantic"])
        score = round(100 * (semantic_score * 0.70 + relationship_strength * 0.20 + recency_score * 0.10), 1)
        evidence = list(candidate["evidence"])
        if relationship_strength:
            evidence.append(f"strongest relationship signal {relationship_strength:.0%}")
        if last_interaction:
            evidence.append("has interaction history" if not reconnecting else "is due for a reconnection")
        elif reconnecting:
            evidence.append("no recent interaction is recorded")
        why = "; ".join(evidence[:3])
        why = why[:1].upper() + why[1:] + "."
        results.append(NetworkSearchResult(
            person_id=person.id,
            name=person.name,
            bio=person.bio or "",
            score=score,
            semantic_score=round(semantic_score, 3),
            relationship_strength=round(relationship_strength, 3),
            recency_score=round(recency_score, 3),
            why=why,
            suggested_action=_suggested_action(person.name, query),
            last_interaction_at=last_interaction,
        ))
    results.sort(key=lambda result: (-result.score, result.name.casefold()))
    return NetworkSearchOut(query=query, results=results[:payload.limit])


def _latest_interactions(db: Session) -> dict[str, datetime]:
    latest: dict[str, datetime] = {}
    for interaction in db.query(InteractionMemory).filter(InteractionMemory.person_id.is_not(None)).all():
        if interaction.person_id and (
            interaction.person_id not in latest or interaction.happened_at > latest[interaction.person_id]
        ):
            latest[interaction.person_id] = interaction.happened_at
    return latest


def _person_connected_to_organization(relationship: Relationship, organization_id: str) -> str | None:
    if relationship.source_type == "person" and relationship.target_type == "organization" and relationship.target_id == organization_id:
        return relationship.source_id
    if relationship.target_type == "person" and relationship.source_type == "organization" and relationship.source_id == organization_id:
        return relationship.target_id
    return None


def _relationship_has_person(relationship: Relationship, person_id: str) -> bool:
    return (relationship.source_type == "person" and relationship.source_id == person_id) or (
        relationship.target_type == "person" and relationship.target_id == person_id
    )


def _is_reconnect_query(query: str) -> bool:
    lowered = query.casefold()
    return any(term in lowered for term in ("haven't", "havent", "not talked", "reconnect", "long time", "follow up"))


def _recency_score(last_interaction: datetime | None, reconnecting: bool) -> float:
    if last_interaction is None:
        return 1.0 if reconnecting else 0.3
    if last_interaction.tzinfo is None:
        last_interaction = last_interaction.replace(tzinfo=timezone.utc)
    days_ago = max(0, (datetime.now(timezone.utc) - last_interaction).days)
    freshness = max(0.0, 1 - days_ago / 90)
    return 1 - freshness if reconnecting else freshness


def _suggested_action(name: str, query: str) -> str:
    """Choose a concrete next action based on the searcher's stated intent."""
    lowered = query.casefold()
    if any(term in lowered for term in ("introduce", "introduction", "intro", "warm connection")):
        return f"Ask {name} whether they would feel comfortable making an introduction."
    if _is_reconnect_query(query):
        return f"Reconnect with {name} and ask for a quick catch-up."
    if any(term in lowered for term in ("follow up", "follow-up", "followup")):
        return f"Send {name} a focused follow-up with a clear next step."
    return f"Ask {name} for a 15-minute coffee chat."


def _names(orgs: list[Organization], kinds: set[str] | None) -> list[str]:
    names = {
        org.name
        for org in orgs
        if kinds is None or (org.type or "").lower() in kinds
    }
    return sorted(names)


def _organization_groups(
    people: list[TrackerPersonOut], field: str, kind: str
) -> list[TrackerGroupOut]:
    grouped: dict[str, list[str]] = defaultdict(list)
    for person in people:
        for name in getattr(person, field):
            grouped[name].append(person.name)
    return _by_coverage(
        TrackerGroupOut(
            name=name,
            kind=kind,
            count=len(names),
            people=sorted(names),
        )
        for name, names in grouped.items()
    )


def _all_organization_groups(
    people: list[TrackerPersonOut],
    affiliations: dict[str, list[Organization]],
) -> list[TrackerGroupOut]:
    names_by_person = {person.id: person.name for person in people}
    grouped: dict[str, list[str]] = defaultdict(list)
    kinds: dict[str, str] = {}
    for person_id, orgs in affiliations.items():
        person_name = names_by_person.get(person_id)
        if not person_name:
            continue
        for org in orgs:
            if (org.type or "").lower() in {"company", "club"}:
                continue
            grouped[org.name].append(person_name)
            kinds[org.name] = org.type or "organization"
    return _by_coverage(
        TrackerGroupOut(
            name=name,
            kind=kinds.get(name, "organization"),
            count=len(set(names)),
            people=sorted(set(names)),
        )
        for name, names in grouped.items()
    )


def _location_groups(people: list[TrackerPersonOut]) -> list[TrackerGroupOut]:
    grouped: dict[str, list[str]] = defaultdict(list)
    for person in people:
        grouped[person.location or UNKNOWN_LOCATION].append(person.name)
    return _by_coverage(
        TrackerGroupOut(
            name=name,
            kind="location",
            count=len(names),
            people=sorted(names),
        )
        for name, names in grouped.items()
    )


def _by_coverage(groups: Iterable[TrackerGroupOut]) -> list[TrackerGroupOut]:
    """Widest coverage first, with unplaced people last and ties broken by name."""
    return sorted(
        groups,
        key=lambda group: (
            group.name == UNKNOWN_LOCATION,
            -group.count,
            group.name.lower(),
        ),
    )
