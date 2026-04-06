"""
Gemini text-embedding-004 wrapper.

The google-generativeai SDK is synchronous. To keep FastAPI fully async,
embedding calls are offloaded to a thread via asyncio.run_in_executor.
Retry logic: up to 3 attempts with exponential backoff.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import List

import google.generativeai as genai

from api.config import get_settings

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "models/text-embedding-004"
EMBEDDING_DIMENSIONS = 768
MAX_RETRIES = 3
RETRY_BASE_DELAY = 1.0  # seconds


def _configure_client() -> None:
    """Configure Gemini SDK once (idempotent)."""
    settings = get_settings()
    genai.configure(api_key=settings.google_api_key)


def _embed_sync(text: str) -> List[float]:
    """
    Synchronous Gemini embedding call with retry + exponential backoff.
    Runs inside a thread pool — do not call from async context directly.
    """
    _configure_client()

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = genai.embed_content(
                model=EMBEDDING_MODEL,
                content=text,
                task_type="retrieval_document",
            )
            embedding: List[float] = result["embedding"]
            if len(embedding) != EMBEDDING_DIMENSIONS:
                raise ValueError(
                    f"Unexpected embedding dimension: {len(embedding)} (expected {EMBEDDING_DIMENSIONS})"
                )
            return embedding
        except Exception as e:
            if attempt == MAX_RETRIES:
                logger.error("Embedding failed after %d retries: %s", MAX_RETRIES, e)
                raise
            delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))
            logger.warning("Embedding attempt %d failed, retrying in %.1fs: %s", attempt, delay, e)
            time.sleep(delay)

    raise RuntimeError("Embedding failed — should not reach here")


def _embed_query_sync(text: str) -> List[float]:
    """
    Like _embed_sync but uses task_type='retrieval_query' for asymmetric retrieval.
    Gemini text-embedding-004 supports task-type-aware embeddings.
    """
    _configure_client()

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = genai.embed_content(
                model=EMBEDDING_MODEL,
                content=text,
                task_type="retrieval_query",
            )
            return result["embedding"]
        except Exception as e:
            if attempt == MAX_RETRIES:
                raise
            delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))
            logger.warning("Query embedding attempt %d failed, retrying in %.1fs: %s", attempt, delay, e)
            time.sleep(delay)

    raise RuntimeError("Query embedding failed")


async def embed_text(text: str) -> List[float]:
    """Async wrapper for document chunk embedding."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _embed_sync, text)


async def embed_query(text: str) -> List[float]:
    """Async wrapper for query embedding (uses retrieval_query task type)."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _embed_query_sync, text)


async def embed_batch(texts: List[str]) -> List[List[float]]:
    """
    Embed a list of texts concurrently (bounded to avoid rate limits).
    Uses asyncio.gather with a semaphore to limit concurrency to 5.
    """
    semaphore = asyncio.Semaphore(5)

    async def _bounded_embed(text: str) -> List[float]:
        async with semaphore:
            return await embed_text(text)

    return await asyncio.gather(*[_bounded_embed(t) for t in texts])
