from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Organization, Person, PersonProfile, Relationship
from ..schemas import NetworkTrackerOut, TrackerGroupOut, TrackerPersonOut

router = APIRouter(prefix="/network", tags=["network"])


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
    return [
        TrackerGroupOut(
            name=name,
            kind=kind,
            count=len(names),
            people=sorted(names),
        )
        for name, names in sorted(grouped.items())
    ]


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
    return [
        TrackerGroupOut(
            name=name,
            kind=kinds.get(name, "organization"),
            count=len(set(names)),
            people=sorted(set(names)),
        )
        for name, names in sorted(grouped.items())
    ]


def _location_groups(people: list[TrackerPersonOut]) -> list[TrackerGroupOut]:
    grouped: dict[str, list[str]] = defaultdict(list)
    for person in people:
        grouped[person.location or "Unknown"].append(person.name)
    return [
        TrackerGroupOut(
            name=name,
            kind="location",
            count=len(names),
            people=sorted(names),
        )
        for name, names in sorted(grouped.items())
    ]
