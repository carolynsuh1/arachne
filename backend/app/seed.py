import json
from pathlib import Path

from sqlalchemy.orm import Session

from .ingest import replace_network

SAMPLE_DIR = Path(__file__).resolve().parent.parent / "sample_data"


def load_sample_payload() -> dict:
    payload = {}
    for name in ("people", "organizations", "relationships"):
        path = SAMPLE_DIR / f"{name}.json"
        payload[name] = json.loads(path.read_text())
    return payload


def seed_if_empty(db: Session) -> dict | None:
    from .models import Person

    if db.query(Person).count() > 0:
        return None
    return replace_network(
        db,
        load_sample_payload(),
        source="seed",
        detail="Loaded local sample JSON because the network tables were empty.",
    )
