"""Step 4: Dropbox messy-data ingest.

Import notes, PDFs, resumes, contact exports, club docs, meeting notes.
Write structured rows into SQLite (and later Elastic). Do not use
dropbox_client.download_network(), which only loads demo /network/*.json.
"""


def ingest_dropbox_folder(folder: str = "/inbox"):
    raise NotImplementedError("Owned by teammates: Dropbox messy-data ingestion (step 4).")
