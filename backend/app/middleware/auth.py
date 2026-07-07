import os

from fastapi import Header, HTTPException


def require_internal_key(x_api_key: str | None = Header(default=None)):
    """Header check on mutating endpoints. If INTERNAL_API_KEY isn't set
    (e.g. local dev), the check is bypassed."""
    expected = os.environ.get("INTERNAL_API_KEY")
    if not expected:
        return
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="invalid or missing api key")
