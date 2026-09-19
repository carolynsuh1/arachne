#!/usr/bin/env python3
"""
index_to_es.py

Creates the entities/relationships/interactions indices in Elastic Cloud
(from es_index_mappings.json) and bulk-loads your merged, embedded data
into them.

Requires:
    pip install elasticsearch python-dotenv

Reads from .env:
    ELASTIC_ENDPOINT   e.g. https://my-elasticsearch-project-xxxx.es.us-east4.gcp.elastic.cloud:443
    ELASTIC_API_KEY

Usage:
    python3 index_to_es.py
"""

import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()

try:
    from elasticsearch import Elasticsearch
    from elasticsearch.helpers import bulk
except ImportError:
    print("Missing dependency. Run: pip install elasticsearch python-dotenv")
    sys.exit(1)

INDEX_NAMES = {
    "entities": "yourweb-entities",
    "relationships": "yourweb-relationships",
    "interactions": "yourweb-interactions",
}

FILES = {
    "entities": ("merged_entities_embedded.json", "entity_id"),
    "relationships": ("merged_relationships.json", "relationship_id"),
    "interactions": ("merged_interactions_embedded.json", "interaction_id"),
}


def get_client():
    endpoint = os.environ.get("ELASTIC_ENDPOINT")
    api_key = os.environ.get("ELASTIC_API_KEY")
    if not endpoint or not api_key:
        print("ELASTIC_ENDPOINT / ELASTIC_API_KEY not found in .env")
        sys.exit(1)
    client = Elasticsearch(endpoint, api_key=api_key)
    if not client.ping():
        print("Could not connect to Elasticsearch. Check your endpoint/key in .env.")
        sys.exit(1)
    print("Connected to Elasticsearch.\n")
    return client


def ensure_index(client, index_name, mapping_body):
    if client.indices.exists(index=index_name):
        print(f"Index '{index_name}' already exists, leaving as-is.")
        return
    client.indices.create(index=index_name, mappings=mapping_body["mappings"])
    print(f"Created index '{index_name}'.")


def bulk_load(client, index_name, docs, id_field):
    if not docs:
        print(f"  Nothing to index into '{index_name}' (empty file).")
        return

    def actions():
        for doc in docs:
            yield {
                "_index": index_name,
                "_id": doc[id_field],  # re-running this script updates docs in place, no dupes
                "_source": doc,
            }

    success, errors = bulk(
        client, actions(), raise_on_error=False, stats_only=False, refresh="wait_for"
    )
    if errors:
        print(f"  {len(errors)} error(s) indexing into '{index_name}':")
        for e in errors[:5]:
            print(f"    {e}")
    print(f"  Indexed {success}/{len(docs)} document(s) into '{index_name}'.")


def main():
    client = get_client()

    with open("es_index_mappings.json") as f:
        mappings = json.load(f)

    print("Ensuring indices exist...")
    for key, index_name in INDEX_NAMES.items():
        ensure_index(client, index_name, mappings[key])

    print("\nLoading merged/embedded data files...")
    for key, (filename, id_field) in FILES.items():
        with open(filename) as f:
            docs = json.load(f)
        print(f"\nIndexing {len(docs)} record(s) from {filename} -> '{INDEX_NAMES[key]}'...")
        bulk_load(client, INDEX_NAMES[key], docs, id_field)

    print("\nDone. Try a quick count check:")
    for key, index_name in INDEX_NAMES.items():
        count = client.count(index=index_name)["count"]
        print(f"  {index_name}: {count} document(s)")


if __name__ == "__main__":
    main()
