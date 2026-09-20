"""Optional shared-secret guard for the Next.js app (Arachne) that fronts this API.

When no key is configured nothing changes, so the existing Vite app keeps working. When a key is
configured, every HTTP request except /health must send it as X-Internal-Key.
"""

import hmac

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


def install_internal_key_guard(app: FastAPI, key: str) -> None:
    if not key:
        return

    @app.middleware("http")
    async def require_internal_key(request: Request, call_next):
        if request.method != "OPTIONS" and request.url.path != "/health":
            if not hmac.compare_digest(request.headers.get("x-internal-key", ""), key):
                return JSONResponse({"detail": "Missing or invalid internal key."}, status_code=401)
        return await call_next(request)
