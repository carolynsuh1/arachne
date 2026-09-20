"""Small idempotent SQLite migrations for installations created before Alembic.

The project intentionally uses ``create_all`` plus guarded ALTER statements.
Keep additions nullable or give them SQL defaults so an existing app.db remains
readable throughout the migration.
"""

from datetime import datetime

from sqlalchemy import Engine


RELATIONSHIP_COLUMNS = {
    "relationship_strength": "FLOAT DEFAULT 0.5",
    "confidence": "FLOAT DEFAULT 0.25",
    "last_interaction_at": "DATETIME",
    "interaction_count": "INTEGER DEFAULT 0",
    "intro_probability": "FLOAT DEFAULT 0.0",
    "created_at": "DATETIME",
    "updated_at": "DATETIME",
}

# SQLite's ``ADD COLUMN ... DEFAULT`` writes the default into existing rows, so a
# seeded column is indistinguishable from one a user really set to the default.
# Data migrations therefore have to be tracked by name rather than inferred from
# the schema, otherwise a database that gained the column without the backfill
# can never be repaired.
RELATIONSHIP_STRENGTH_BACKFILL = "relationships.relationship_strength_from_strength"


def migrate_schema(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS schema_migrations "
            "(id VARCHAR PRIMARY KEY, applied_at DATETIME)"
        )
        applied = {
            str(row[0])
            for row in conn.exec_driver_sql("SELECT id FROM schema_migrations").all()
        }

        people_columns = _columns(conn, "people")
        if "university" not in people_columns:
            conn.exec_driver_sql("ALTER TABLE people ADD COLUMN university VARCHAR DEFAULT ''")

        relationship_columns = _columns(conn, "relationships")
        for name, definition in RELATIONSHIP_COLUMNS.items():
            if name not in relationship_columns:
                conn.exec_driver_sql(
                    f"ALTER TABLE relationships ADD COLUMN {name} {definition}"
                )

        now = datetime.utcnow()
        if RELATIONSHIP_STRENGTH_BACKFILL not in applied:
            conn.exec_driver_sql(
                "UPDATE relationships SET relationship_strength = COALESCE(strength, 0.5)"
            )
            conn.exec_driver_sql(
                "INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)",
                (RELATIONSHIP_STRENGTH_BACKFILL, now),
            )

        conn.exec_driver_sql(
            """
            UPDATE relationships
            SET relationship_strength = COALESCE(relationship_strength, strength, 0.5),
                confidence = COALESCE(confidence, 0.25),
                interaction_count = COALESCE(interaction_count, 0),
                intro_probability = COALESCE(intro_probability, 0.0),
                created_at = COALESCE(created_at, ?),
                updated_at = COALESCE(updated_at, created_at, ?)
            """,
            (now, now),
        )

        legacy_rows = conn.exec_driver_sql(
            "SELECT id, evidence, created_at FROM relationships "
            "WHERE TRIM(COALESCE(evidence, '')) <> ''"
        ).all()
        for relationship_id, evidence, created_at in legacy_rows:
            conn.exec_driver_sql(
                """
                INSERT OR IGNORE INTO graph_evidence
                (id, entity_type, entity_id, evidence_type, evidence_id, event_type,
                 excerpt, confidence, metadata_json, created_at)
                VALUES (?, 'relationship', ?, 'legacy', ?, 'observation', ?, 0.5, '{}', ?)
                """,
                (
                    f"legacy-{relationship_id}",
                    relationship_id,
                    relationship_id,
                    evidence,
                    created_at or now,
                ),
            )


def _columns(conn, table: str) -> set[str]:
    return {
        str(row[1])
        for row in conn.exec_driver_sql(f"PRAGMA table_info({table})").all()
    }
