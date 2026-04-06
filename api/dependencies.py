"""Shared FastAPI dependencies."""
from fastapi import Header, HTTPException, status
from api.config import get_settings


async def verify_internal_key(x_internal_api_key: str = Header(..., alias="X-Internal-API-Key")):
    """
    Validate the shared secret between Next.js and FastAPI.
    Prevents direct public access to the ingestion/query endpoints.
    """
    settings = get_settings()
    if x_internal_api_key != settings.internal_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal API key.",
        )
