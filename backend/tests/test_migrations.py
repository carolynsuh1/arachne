import unittest

from sqlalchemy import create_engine

from app import models  # noqa: F401  (registers the tables on Base.metadata)
from app.database import Base
from app.migrations import migrate_schema


class MigrationTests(unittest.TestCase):
    def test_existing_relationship_table_is_extended_and_backfilled(self):
        engine = create_engine("sqlite://")
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "CREATE TABLE relationships ("
                "id VARCHAR PRIMARY KEY, source_type VARCHAR, source_id VARCHAR, "
                "target_type VARCHAR, target_id VARCHAR, type VARCHAR, "
                "strength FLOAT, evidence TEXT)"
            )
            conn.exec_driver_sql(
                "INSERT INTO relationships VALUES "
                "('r1','person','a','person','b','knows',0.7,'Met at a lab.')"
            )
        Base.metadata.create_all(engine)
        migrate_schema(engine)
        migrate_schema(engine)
        with engine.begin() as conn:
            columns = {
                row[1]
                for row in conn.exec_driver_sql(
                    "PRAGMA table_info(relationships)"
                ).all()
            }
            self.assertIn("relationship_strength", columns)
            self.assertIn("intro_probability", columns)
            row = conn.exec_driver_sql(
                "SELECT relationship_strength, interaction_count FROM relationships WHERE id='r1'"
            ).one()
            self.assertEqual(row[0], 0.7)
            self.assertEqual(row[1], 0)
            evidence = conn.exec_driver_sql(
                "SELECT id, excerpt FROM graph_evidence"
            ).all()
            self.assertEqual(evidence, [("legacy-r1", "Met at a lab.")])
        engine.dispose()

    def test_column_added_without_its_backfill_is_repaired(self):
        """A database that gained the column but never ran the data migration.

        ``ADD COLUMN ... DEFAULT`` seeds existing rows, so the column looks
        populated and the backfill can only be recognised as outstanding by the
        migration ledger.
        """
        engine = create_engine("sqlite://")
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "CREATE TABLE relationships ("
                "id VARCHAR PRIMARY KEY, source_type VARCHAR, source_id VARCHAR, "
                "target_type VARCHAR, target_id VARCHAR, type VARCHAR, "
                "strength FLOAT, evidence TEXT)"
            )
            conn.exec_driver_sql(
                "INSERT INTO relationships VALUES "
                "('r1','person','a','person','b','knows',0.95,'')"
            )
            conn.exec_driver_sql(
                "ALTER TABLE relationships ADD COLUMN relationship_strength FLOAT DEFAULT 0.5"
            )
        Base.metadata.create_all(engine)
        migrate_schema(engine)
        with engine.begin() as conn:
            strength = conn.exec_driver_sql(
                "SELECT relationship_strength FROM relationships WHERE id='r1'"
            ).scalar()
            self.assertEqual(strength, 0.95)
        engine.dispose()

    def test_backfill_does_not_overwrite_later_rescoring(self):
        """Once applied, the backfill must not clobber recomputed scores."""
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        migrate_schema(engine)
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "INSERT INTO relationships "
                "(id, source_type, source_id, target_type, target_id, type, strength, "
                "evidence, relationship_strength, confidence, interaction_count, "
                "intro_probability, created_at, updated_at) VALUES "
                "('r1','person','a','person','b','knows',0.4,'',0.82,0.6,3,0.1,"
                "'2026-01-01 00:00:00','2026-01-01 00:00:00')"
            )
        migrate_schema(engine)
        with engine.begin() as conn:
            strength = conn.exec_driver_sql(
                "SELECT relationship_strength FROM relationships WHERE id='r1'"
            ).scalar()
            self.assertEqual(strength, 0.82)
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
