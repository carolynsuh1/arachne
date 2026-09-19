"""Demo JSON download only.

This is NOT Dropbox messy-file ingest (step 4) and NOT entity extraction (step 5).
Teammates should add their Dropbox crawler under backend/app/pipeline/ and must
not be wiped by this module.

If you use the same Dropbox app, keep structured demo JSON in /network/ and put
raw notes/PDFs/resumes in a different folder such as /inbox/.
"""

import json
import os

import httpx

DOWNLOAD_URL = "https://content.dropboxapi.com/2/files/download"

NETWORK_PATHS = {
    "people": "/network/people.json",
    "organizations": "/network/organizations.json",
    "relationships": "/network/relationships.json",
}


class DropboxError(Exception):
    pass


def get_access_token() -> str | None:
    token = os.getenv("DROPBOX_ACCESS_TOKEN", "").strip()
    return token or None


def download_json(path: str) -> list | dict:
    token = get_access_token()
    if not token:
        raise DropboxError("DROPBOX_ACCESS_TOKEN is not set")

    headers = {
        "Authorization": f"Bearer {token}",
        "Dropbox-API-Arg": json.dumps({"path": path}),
    }
    try:
        response = httpx.post(DOWNLOAD_URL, headers=headers, timeout=30.0)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise DropboxError(f"Could not download {path}: {exc}") from exc

    try:
        return json.loads(response.content.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise DropboxError(f"{path} is not valid JSON") from exc


def download_network() -> dict[str, list]:
    payload = {}
    for key, path in NETWORK_PATHS.items():
        data = download_json(path)
        if not isinstance(data, list):
            raise DropboxError(f"{path} must be a JSON list")
        payload[key] = data
    return payload
