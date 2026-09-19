#!/usr/bin/env python3
"""
embed_entities.py

Reads merged_entities.json and merged_interactions.json (output of
merge_entities.py), generates an OpenAI embedding for each record, and
writes out versions with an "embedding" field attached — ready to bulk-index
into Elasticsearch against the dense_vector mapping.

Requires:
    pip install openai python-dotenv

Usage:
    python3 embed_entities.py
    python3 embed_entities.py --model text-embedding-3-small

Reads OPENAI_API_KEY from your .env file (same pattern as extract.py's
ANTHROPIC_API_KEY).
"""

import json
import os
import sys
import argparse

from dotenv import load_dotenv

load_dotenv()

try:
    from openai import OpenAI
except ImportError:
    print("Missing dependency. Run: pip install openai python-dotenv")
    sys.exit(1)

BATCH_SIZE = 100  # texts per API call — plenty for a hackathon-scale dataset


def entity_text(entity: dict) -> str:
    """Build the text we embed for a given entity, based on its type."""
    etype = entity.get("type", "")
    name = entity.get("name", "")

    if etype == "Person":
        parts = [name]
        if entity.get("role"):
            parts.append(f"Role: {entity['role']}")
        if entity.get("org"):
            parts.append(f"Org: {entity['org']}")
        if entity.get("location"):
            parts.append(f"Location: {entity['location']}")
        if entity.get("interests"):
            parts.append(f"Interests: {', '.join(entity['interests'])}")
        if entity.get("skills"):
            parts.append(f"Skills: {', '.join(entity['skills'])}")
        return ". ".join(parts)

    if etype == "Organization":
        parts = [name]
        if entity.get("category"):
            parts.append(f"Category: {entity['category']}")
        if entity.get("domain"):
            parts.append(f"Domain: {entity['domain']}")
        return ". ".join(parts)

    if etype == "Project":
        parts = [name]
        if entity.get("description"):
            parts.append(entity["description"])
        if entity.get("org"):
            parts.append(f"Org: {entity['org']}")
        return ". ".join(parts)

    # Interest, Skill, and any unrecognized type: just the name
    return name


def interaction_text(interaction: dict) -> str:
    parts = []
    if interaction.get("summary"):
        parts.append(interaction["summary"])
    if interaction.get("next_steps"):
        parts.append(f"Next steps: {interaction['next_steps']}")
    return ". ".join(parts) if parts else interaction.get("person_name", "")


def embed_batches(client, model, texts):
    """Embed a list of texts in batches, preserving order."""
    vectors = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        response = client.embeddings.create(model=model, input=batch)
        # response.data is returned in the same order as the input
        vectors.extend([d.embedding for d in response.data])
        print(f"  embedded {min(i + BATCH_SIZE, len(texts))}/{len(texts)}")
    return vectors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="text-embedding-3-small")
    parser.add_argument("--entities-in", default="merged_entities.json")
    parser.add_argument("--interactions-in", default="merged_interactions.json")
    parser.add_argument("--entities-out", default="merged_entities_embedded.json")
    parser.add_argument("--interactions-out", default="merged_interactions_embedded.json")
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY not found. Add it to your .env file first.")
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    with open(args.entities_in) as f:
        entities = json.load(f)
    with open(args.interactions_in) as f:
        interactions = json.load(f)

    print(f"Embedding {len(entities)} entities with {args.model}...")
    entity_texts = [entity_text(e) for e in entities]
    entity_vectors = embed_batches(client, args.model, entity_texts)
    for e, v in zip(entities, entity_vectors):
        e["embedding"] = v

    if interactions:
        print(f"Embedding {len(interactions)} interactions with {args.model}...")
        interaction_texts = [interaction_text(i) for i in interactions]
        interaction_vectors = embed_batches(client, args.model, interaction_texts)
        for i, v in zip(interactions, interaction_vectors):
            i["embedding"] = v
    else:
        print("No interactions to embed.")

    with open(args.entities_out, "w") as f:
        json.dump(entities, f, indent=2)
    with open(args.interactions_out, "w") as f:
        json.dump(interactions, f, indent=2)

    dims = len(entity_vectors[0]) if entity_vectors else 0
    print(f"\nDone. Embedding dimension: {dims}")
    print(f"Wrote {args.entities_out} and {args.interactions_out}")
    if dims and dims != 1536:
        print(f"NOTE: dims={dims} does not match the 1536 in es_index_mappings.json — "
              f"update the mapping's dense_vector 'dims' before creating the index.")


if __name__ == "__main__":
    main()
