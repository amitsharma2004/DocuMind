"""
BGE Reranker — cross-encoder reranking using BAAI/bge-reranker-large.

Flow:
  1. Retriever fetches top-15 chunks (vector similarity)
  2. Reranker scores each (query, chunk) pair using cross-encoder
  3. Top-5 reranked chunks are returned to the query pipeline
"""
from __future__ import annotations

import asyncio
import logging
from typing import List

from api.models import ScoredChunk

logger = logging.getLogger(__name__)

RERANKER_MODEL = "BAAI/bge-reranker-large"
TOP_N = 5

_reranker = None


def _get_reranker():
    """Lazy-load the cross-encoder model (downloaded on first use)."""
    global _reranker
    if _reranker is None:
        try:
            from sentence_transformers import CrossEncoder
            logger.info("Loading BGE reranker model: %s", RERANKER_MODEL)
            _reranker = CrossEncoder(RERANKER_MODEL, max_length=512)
            logger.info("BGE reranker loaded successfully")
        except ImportError:
            logger.warning("sentence-transformers not installed — reranking disabled")
            return None
    return _reranker


def _rerank_sync(query: str, chunks: List[ScoredChunk], top_n: int) -> List[ScoredChunk]:
    """
    Synchronous reranking — runs in thread pool.
    Scores each (query, chunk_text) pair and returns top_n sorted by rerank score.
    """
    reranker = _get_reranker()

    if reranker is None:
        # Fallback: return top_n by original vector score
        logger.warning("Reranker unavailable — falling back to vector scores")
        return sorted(chunks, key=lambda c: c.score, reverse=True)[:top_n]

    pairs = [(query, chunk.text) for chunk in chunks]
    scores = reranker.predict(pairs)  # returns list of floats

    # Attach rerank scores and sort
    scored = sorted(zip(scores, chunks), key=lambda x: x[0], reverse=True)

    top_chunks = []
    for rerank_score, chunk in scored[:top_n]:
        # Replace vector score with rerank score for downstream use
        reranked = chunk.model_copy(update={"score": float(rerank_score)})
        top_chunks.append(reranked)

    logger.info(
        "Reranked %d → %d chunks | top score: %.4f",
        len(chunks), len(top_chunks),
        top_chunks[0].score if top_chunks else 0.0,
    )
    return top_chunks


async def rerank_chunks(
    query: str,
    chunks: List[ScoredChunk],
    top_n: int = TOP_N,
) -> List[ScoredChunk]:
    """
    Async wrapper for reranking.
    Runs the CPU-bound cross-encoder in a thread pool.
    """
    if not chunks:
        return chunks

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _rerank_sync, query, chunks, top_n)
