#!/usr/bin/env python3
"""
merge_entities.py

Combines multiple extract.py output files (one per source doc) into three
deduplicated files ready for Elasticsearch indexing:

    merged_entities.json
    merged_relationships.json
    merged_interactions.json

Usage:
    python3 merge_entities.py *_extracted.json
    python3 merge_entities.py sample_doc_1_resume_notes_extracted.json sample_doc_2_club_notes_extracted.json sample_doc_3_contacts_export_extracted.json

Dedup strategy:
    entity_id = slugify(name) + "_" + type.lower()
    Two entities collapse into one iff they share this id (same name, same type,
    case/whitespace-insensitive). Array fields (interests, skills, source_docs)
    are unioned; scalar fields keep the first non-empty value seen and log a
    warning if a later doc disagrees, so you can review conflicts manually.
    A second pass then catches Person entities where one doc used a short name
    (e.g. "Jason O" vs "Jason Okafor") and merges those too.

Known-issue patch:
    A couple of the sample extractions typed research labs as "Project"
    instead of "Organization" (inconsistent with other docs). Any Project
    entity whose name contains "lab" is reclassified as an Organization.
    Remove RELABEL_LAB_PROJECTS_AS_ORG if you'd rather fix this in the
    extract.py prompt instead.
"""

import json
import re
import sys
import glob
from pathlib import Path
from collections import defaultdict

ENTITY_TYPES = ["Person", "Organization", "Project", "Interest", "Skill"]
RELABEL_LAB_PROJECTS_AS_ORG = True


def slugify(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")


def normalize(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def load_files(paths):
    docs = []
    for p in paths:
        with open(p, "r") as f:
            data = json.load(f)
        docs.append((Path(p).name, data))
    return docs


def merge_scalar(existing, new_val, field, entity_id, conflicts):
    if not new_val:
        return existing
    if not existing:
        return new_val
    if normalize(str(existing)) != normalize(str(new_val)) :
        conflicts.append(
            f"  [{entity_id}] field '{field}': kept \"{existing}\" over \"{new_val}\""
        )
    return existing


def merge_list(existing, new_vals, entity_id):
    if not new_vals:
        return existing
    seen = {normalize(v): v for v in existing}
    for v in new_vals:
        key = normalize(v)
        if key and key not in seen:
            seen[key] = v
            existing.append(v)
    return existing


def merge_entities(docs):
    entities = {}  # entity_id -> merged record
    name_type_to_id = {}  # (normalized_name, type) -> entity_id
    conflicts = []
    relabeled = []

    for source_doc, data in docs:
        for etype in ENTITY_TYPES:
            for raw in data.get("entities", {}).get(etype, []):
                name = raw.get("name", "").strip()
                if not name:
                    continue

                effective_type = etype
                if (
                    RELABEL_LAB_PROJECTS_AS_ORG
                    and etype == "Project"
                    and "lab" in name.lower()
                ):
                    effective_type = "Organization"
                    relabeled.append(f"  \"{name}\" reclassified Project -> Organization")

                eid = f"{slugify(name)}_{effective_type.lower()}"
                name_type_to_id[(normalize(name), effective_type)] = eid

                if eid not in entities:
                    entities[eid] = {
                        "entity_id": eid,
                        "type": effective_type,
                        "name": name,
                        "normalized_name": normalize(name),
                        "aliases": [],
                        "source_docs": [],
                    }
                rec = entities[eid]

                # merge every field present on the raw entity except name/type
                for k, v in raw.items():
                    if k in ("name",):
                        continue
                    if k == "source_doc":
                        if source_doc not in rec["source_docs"]:
                            rec["source_docs"].append(source_doc)
                        continue
                    if k == "type":
                        # raw per-entity 'type' (e.g. Organization sub-type like
                        # "Company"/"University") collides with our top-level
                        # entity classification field, so store it separately.
                        k = "category"
                    if isinstance(v, list):
                        rec[k] = merge_list(rec.get(k, []), v, eid)
                    else:
                        rec[k] = merge_scalar(rec.get(k), v, k, eid, conflicts)

                if source_doc not in rec["source_docs"]:
                    rec["source_docs"].append(source_doc)

    return list(entities.values()), name_type_to_id, conflicts, relabeled


def names_fuzzy_match(name_a, name_b):
    """
    True if two Person names look like the same person written with different
    completeness, e.g. "Jason O" vs "Jason Okafor": same first name, and one's
    last-name token is just an initial that matches the start of the other's.
    Deliberately conservative — different first names, or two full last names
    that simply differ, never match.
    """
    a = normalize(name_a).split()
    b = normalize(name_b).split()
    if len(a) < 2 or len(b) < 2:
        return False
    if a[0] != b[0]:
        return False
    a_last, b_last = a[-1].rstrip("."), b[-1].rstrip(".")
    if a_last == b_last:
        return False  # identical -> already merged by exact match, not this path
    if len(a_last) == 1 and b_last.startswith(a_last):
        return True
    if len(b_last) == 1 and a_last.startswith(b_last):
        return True
    return False


def fuzzy_merge_persons(entities, name_type_to_id, conflicts):
    """
    Second dedup pass, Person-only: catches same-person entities that survived
    the exact-match pass because one doc used a short/abbreviated name. Keeps
    the fuller name as canonical, records the short name as an alias, and
    repoints name_type_to_id so relationships/interactions resolve correctly.
    """
    persons = [e for e in entities if e["type"] == "Person"]
    merged_away = set()
    merge_log = []

    for i, a in enumerate(persons):
        if a["entity_id"] in merged_away:
            continue
        for b in persons[i + 1:]:
            if b["entity_id"] in merged_away or b["entity_id"] == a["entity_id"]:
                continue
            if not names_fuzzy_match(a["name"], b["name"]):
                continue

            canonical, dup = (a, b) if len(a["name"]) >= len(b["name"]) else (b, a)

            for field in ("role", "org", "location", "description", "category", "domain"):
                if field in dup:
                    canonical[field] = merge_scalar(
                        canonical.get(field), dup.get(field), field, canonical["entity_id"], conflicts
                    )
            for field in ("interests", "skills", "source_docs"):
                canonical[field] = merge_list(
                    canonical.get(field, []), dup.get(field, []), canonical["entity_id"]
                )
            canonical.setdefault("aliases", [])
            if dup["name"] != canonical["name"] and dup["name"] not in canonical["aliases"]:
                canonical["aliases"].append(dup["name"])

            for key, eid in list(name_type_to_id.items()):
                if eid == dup["entity_id"]:
                    name_type_to_id[key] = canonical["entity_id"]

            merge_log.append(f"  \"{dup['name']}\" merged into \"{canonical['name']}\" (added as alias)")
            merged_away.add(dup["entity_id"])

    remaining = [e for e in entities if e["entity_id"] not in merged_away]
    return remaining, merge_log


def resolve_id(name, name_type_to_id, unresolved):
    """Find an entity_id for a bare name referenced in a relationship/interaction."""
    key = normalize(name)
    matches = [eid for (n, t), eid in name_type_to_id.items() if n == key]
    if not matches:
        unresolved.add(name)
        return None
    return matches[0]  # ambiguous case: just take the first, dataset is small


def merge_relationships(docs, name_type_to_id):
    rels = {}  # (type, from_id, to_id) -> record
    unresolved = set()

    for source_doc, data in docs:
        for raw in data.get("relationships", []):
            from_id = resolve_id(raw["from"], name_type_to_id, unresolved)
            to_id = resolve_id(raw["to"], name_type_to_id, unresolved)
            if not from_id or not to_id:
                continue
            key = (raw["type"], from_id, to_id)
            if key not in rels:
                rels[key] = {
                    "relationship_id": f"{key[1]}__{key[0]}__{key[2]}",
                    "type": raw["type"],
                    "from_id": from_id,
                    "from_name": raw["from"],
                    "to_id": to_id,
                    "to_name": raw["to"],
                    "source_docs": [],
                }
            if source_doc not in rels[key]["source_docs"]:
                rels[key]["source_docs"].append(source_doc)

    return list(rels.values()), unresolved


def merge_interactions(docs, name_type_to_id):
    interactions = []
    unresolved = set()

    for source_doc, data in docs:
        for i, raw in enumerate(data.get("entities", {}).get("Interaction", [])):
            person_id = resolve_id(raw["person"], name_type_to_id, unresolved)
            interactions.append(
                {
                    "interaction_id": f"{slugify(source_doc)}_{i}",
                    "person_id": person_id,
                    "person_name": raw["person"],
                    "date": raw.get("date", ""),
                    "summary": raw.get("summary", ""),
                    "next_steps": raw.get("next_steps", ""),
                    "source_doc": source_doc,
                }
            )

    return interactions, unresolved


def main():
    args = sys.argv[1:]
    if not args:
        args = sorted(glob.glob("*_extracted.json"))
    if not args:
        print("No input files given and no *_extracted.json found in this directory.")
        sys.exit(1)

    docs = load_files(args)
    print(f"Loaded {len(docs)} file(s): {', '.join(n for n, _ in docs)}\n")

    entities, name_type_to_id, conflicts, relabeled = merge_entities(docs)
    entities, fuzzy_merges = fuzzy_merge_persons(entities, name_type_to_id, conflicts)
    relationships, rel_unresolved = merge_relationships(docs, name_type_to_id)
    interactions, int_unresolved = merge_interactions(docs, name_type_to_id)

    with open("merged_entities.json", "w") as f:
        json.dump(entities, f, indent=2)
    with open("merged_relationships.json", "w") as f:
        json.dump(relationships, f, indent=2)
    with open("merged_interactions.json", "w") as f:
        json.dump(interactions, f, indent=2)

    by_type = defaultdict(int)
    for e in entities:
        by_type[e["type"]] += 1

    print("Merged entities by type:")
    for t in ENTITY_TYPES:
        print(f"  {t}: {by_type.get(t, 0)}")
    print(f"\nTotal unique entities: {len(entities)}")
    print(f"Total unique relationships: {len(relationships)}")
    print(f"Total interactions: {len(interactions)}")

    if relabeled:
        print(f"\nRelabeled {len(relabeled)} entity(ies) (Project -> Organization):")
        for line in relabeled:
            print(line)

    if fuzzy_merges:
        print(f"\nFuzzy-merged {len(fuzzy_merges)} Person(s) (short name matched to full name):")
        for line in fuzzy_merges:
            print(line)
        print("  Double-check these — this heuristic can be wrong if two different")
        print("  people genuinely share a first name and last initial.")

    if conflicts:
        print(f"\n{len(conflicts)} field conflict(s) — first value kept, review if needed:")
        for line in conflicts:
            print(line)

    unresolved = rel_unresolved | int_unresolved
    if unresolved:
        print(f"\nWARNING: {len(unresolved)} name(s) referenced in relationships/interactions "
              f"but not found as an entity — these edges were dropped:")
        for n in sorted(unresolved):
            print(f"  \"{n}\"")

    print("\nWrote merged_entities.json, merged_relationships.json, merged_interactions.json")


if __name__ == "__main__":
    main()
