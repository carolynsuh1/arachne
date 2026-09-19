"""Step 6: index and search the SQLite network with Elasticsearch.

``index_network`` deliberately rebuilds the entity index. SQLite is the
source of truth, so rebuilding prevents records left by the former JSON
pipeline from appearing in goal-search results.
"""

from __future__ import annotations

import json
import os
from typing import Any

from sqlalchemy.orm import Session

from ..models import Organization, Person

INDEX_NAME = "yourweb-entities"
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMS = 1536
EMBEDDING_BATCH_SIZE = 100

INDEX_MAPPINGS = {
    "properties": {
        "entity_id": {"type": "keyword"},
        "type": {"type": "keyword"},
        "name": {"type": "text", "fields": {"keyword": {"type": "keyword", "ignore_above": 256}}},
        "bio": {"type": "text"},
        "organization_type": {"type": "keyword"},
        "description": {"type": "text"},
        "interests": {"type": "keyword"},
        "skills": {"type": "keyword"},
        "search_text": {"type": "text"},
        "embedding": {"type": "dense_vector", "dims": EMBEDDING_DIMS, "index": True, "similarity": "cosine"},
    }
}


class ElasticPipelineError(RuntimeError):
    """A missing configuration or failed OpenAI/Elasticsearch operation."""


def index_network(db: Session) -> dict[str, Any]:
    """Embed current people and organizations, then rebuild the entity index."""
    documents = _network_documents(db)
    es_client, openai_client = _clients()
    _add_embeddings(openai_client, documents)

    index_name = _index_name()
    try:
        if es_client.indices.exists(index=index_name):
            es_client.indices.delete(index=index_name)
        es_client.indices.create(index=index_name, mappings=INDEX_MAPPINGS)
        if documents:
            operations: list[dict[str, Any]] = []
            for document in documents:
                operations.extend([{"index": {"_index": index_name, "_id": document["entity_id"]}}, document])
            response = es_client.bulk(operations=operations, refresh="wait_for")
            if response.get("errors"):
                raise ElasticPipelineError("Elasticsearch rejected one or more entity documents")
    except ElasticPipelineError:
        raise
    except Exception as exc:  # Elasticsearch raises several transport-specific errors.
        raise ElasticPipelineError(f"Elasticsearch indexing failed: {exc}") from exc
    return {"index": index_name, "indexed": len(documents)}


def search(query: str) -> list[dict[str, Any]]:
    """Run hybrid BM25 + vector RRF search and return simple ranked entities."""
    query = query.strip()
    if not query:
        return []
    es_client, openai_client = _clients()
    vector = _embed(openai_client, [query])[0]
    body = {
        "retriever": {
            "rrf": {
                "retrievers": [
                    {"standard": {"query": {"multi_match": {"query": query, "fields": ["name^3", "search_text", "bio", "description"]}}}},
                    {"knn": {"field": "embedding", "query_vector": vector, "k": 10, "num_candidates": 50}},
                ]
            }
        },
        "size": 10,
        "_source": ["entity_id", "name", "type"],
    }
    try:
        response = es_client.search(index=_index_name(), body=body)
    except Exception as exc:
        raise ElasticPipelineError(f"Elasticsearch search failed: {exc}") from exc
    return [
        {"entity_id": hit["_source"]["entity_id"], "name": hit["_source"]["name"], "type": hit["_source"]["type"], "score": hit.get("_score", 0.0)}
        for hit in response.get("hits", {}).get("hits", [])
    ]


def _network_documents(db: Session) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for person in db.query(Person).order_by(Person.id):
        interests, skills = _json_list(person.interests), _json_list(person.skills)
        documents.append({
            "entity_id": person.id, "type": "person", "name": person.name, "bio": person.bio or "",
            "interests": interests, "skills": skills,
            "search_text": _join_text(person.name, person.bio, _labeled("Interests", interests), _labeled("Skills", skills)),
        })
    for organization in db.query(Organization).order_by(Organization.id):
        documents.append({
            "entity_id": organization.id, "type": "organization", "name": organization.name,
            "organization_type": organization.type or "", "description": organization.description or "",
            "search_text": _join_text(organization.name, _labeled("Type", organization.type), organization.description),
        })
    return documents


def _add_embeddings(client: Any, documents: list[dict[str, Any]]) -> None:
    for start in range(0, len(documents), EMBEDDING_BATCH_SIZE):
        batch = documents[start : start + EMBEDDING_BATCH_SIZE]
        for document, vector in zip(batch, _embed(client, [document["search_text"] for document in batch]), strict=True):
            document["embedding"] = vector


def _embed(client: Any, texts: list[str]) -> list[list[float]]:
    response = client.embeddings.create(model=_embedding_model(), input=texts)
    return [item.embedding for item in response.data]


def _clients() -> tuple[Any, Any]:
    endpoint = os.getenv("ELASTIC_ENDPOINT", "").strip()
    elastic_api_key = os.getenv("ELASTIC_API_KEY", "").strip()
    openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not endpoint or not elastic_api_key:
        raise ElasticPipelineError("ELASTIC_ENDPOINT and ELASTIC_API_KEY must be set in backend/.env")
    if not openai_api_key:
        raise ElasticPipelineError("OPENAI_API_KEY must be set in backend/.env")
    try:
        from elasticsearch import Elasticsearch
        from openai import OpenAI
    except ImportError as exc:
        raise ElasticPipelineError("Install elasticsearch and openai in backend/requirements.txt") from exc
    return Elasticsearch(endpoint, api_key=elastic_api_key), OpenAI(api_key=openai_api_key)


def _json_list(raw: str | None) -> list[str]:
    try:
        values = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return []
    return [str(value).strip() for value in values if str(value).strip()] if isinstance(values, list) else []


def _join_text(*parts: str) -> str:
    return ". ".join(str(part).strip() for part in parts if str(part).strip())


def _labeled(label: str, value: str | list[str] | None) -> str:
    if isinstance(value, list):
        return f"{label}: {', '.join(value)}" if value else ""
    return f"{label}: {value.strip()}" if value and value.strip() else ""


def _index_name() -> str:
    return os.getenv("ELASTIC_INDEX", INDEX_NAME).strip() or INDEX_NAME


def _embedding_model() -> str:
    return os.getenv("EMBEDDING_MODEL", EMBEDDING_MODEL).strip() or EMBEDDING_MODEL
