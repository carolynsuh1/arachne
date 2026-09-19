"""Step 6: Elasticsearch index.

Index people, notes, resources, interactions, embeddings.
Steps 1-2 continue to read SQLite only.
"""


def index_network(db):
    raise NotImplementedError("Owned by teammates: Elasticsearch index (step 6).")


def search(query: str):
    raise NotImplementedError("Owned by teammates: Elasticsearch retrieval (step 6).")
