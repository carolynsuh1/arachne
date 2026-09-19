#!/usr/bin/env python3
"""
search.py

Quick hybrid search over the yourweb-entities index: combines regular
keyword matching (BM25) with vector similarity search (kNN) using
Elasticsearch's built-in rrf (Reciprocal Rank Fusion) retriever.

Requires:
    pip install elasticsearch openai python-dotenv

Usage:
    python3 search.py "who's interested in prosthetics"
    python3 search.py           # prompts for a query interactively
"""

import argparse
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()

try:
    from elasticsearch import Elasticsearch
    from openai import OpenAI
except ImportError:
    print("Missing dependency. Run: pip install elasticsearch openai python-dotenv")
    sys.exit(1)

INDEX_NAME = "yourweb-entities"
EMBED_MODEL = "text-embedding-3-small"
ENTITY_TYPES = ["Person", "Organization", "Project", "Interest", "Skill"]

KEYWORD_FIELDS = [
    "name^2",  # ^2 boosts matches on the name field over other fields
    "role",
    "org",
    "location",
    "interests",
    "skills",
    "description",
]


def get_es_client():
    endpoint = os.environ.get("ELASTIC_ENDPOINT")
    api_key = os.environ.get("ELASTIC_API_KEY")
    if not endpoint or not api_key:
        print("ELASTIC_ENDPOINT / ELASTIC_API_KEY not found in .env")
        sys.exit(1)
    return Elasticsearch(endpoint, api_key=api_key)


def get_openai_client():
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY not found in .env")
        sys.exit(1)
    return OpenAI(api_key=api_key)


def embed_query(client, text):
    response = client.embeddings.create(model=EMBED_MODEL, input=[text])
    return response.data[0].embedding


def hybrid_search(es_client, query_text, query_vector, entity_type=None, size=10):
    standard_query = {
        "multi_match": {
            "query": query_text,
            "fields": KEYWORD_FIELDS,
        }
    }
    knn_retriever = {
        "field": "embedding",
        "query_vector": query_vector,
        "k": size,
        "num_candidates": 50,
    }

    if entity_type:
        type_filter = {"term": {"type": entity_type}}
        standard_query = {"bool": {"must": [standard_query], "filter": [type_filter]}}
        knn_retriever["filter"] = type_filter

    body = {
        "retriever": {
            "rrf": {
                "retrievers": [
                    {"standard": {"query": standard_query}},
                    {"knn": knn_retriever},
                ]
            }
        },
        "size": size,
    }
    return es_client.search(index=INDEX_NAME, body=body)


def print_results(response):
    hits = response["hits"]["hits"]
    if not hits:
        print("No results.")
        return
    for i, hit in enumerate(hits, 1):
        src = hit["_source"]
        print(f"{i}. {src.get('name')} ({src.get('type')})  [rrf score: {hit['_score']:.4f}]")
        if src.get("role"):
            print(f"   role: {src['role']}")
        if src.get("org"):
            print(f"   org: {src['org']}")
        if src.get("interests"):
            print(f"   interests: {', '.join(src['interests'])}")
        if src.get("skills"):
            print(f"   skills: {', '.join(src['skills'])}")
        if src.get("description"):
            print(f"   description: {src['description']}")
        print()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--type",
        choices=ENTITY_TYPES,
        default=None,
        help="Restrict results to one entity type, e.g. --type Person",
    )
    parser.add_argument("query", nargs="*", help="The search query")
    args = parser.parse_args()

    query_text = " ".join(args.query) if args.query else input("Search query: ")

    es_client = get_es_client()
    openai_client = get_openai_client()

    label = f" (type={args.type})" if args.type else ""
    print(f"\nEmbedding query and searching '{INDEX_NAME}'{label} for: \"{query_text}\"\n")
    query_vector = embed_query(openai_client, query_text)
    response = hybrid_search(es_client, query_text, query_vector, entity_type=args.type)
    print_results(response)


if __name__ == "__main__":
    main()
