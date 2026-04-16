"""
BGE Reranker — cross-encoder reranking using a lightweight model.

Flow:
  1. Retriever fetches top-15 chunks (vector similarity)
  2. Reranker scores each (query, chunk) pair using semantic similarity
  3. Top-5 reranked chunks are returned to the query pipeline
"""
from __future__ import annotations

import asyncio
import logging
from typing import List
import numpy as np

from api.models import ScoredChunk
from api.services.embedder import embed_query

logger = logging.getLogger(__name__)

TOP_N = 5

_reranker = None


def _get_reranker():
    """Lazy-load the embedding model for reranking."""
    global _reranker
    if _reranker is None:
        try:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading lightweight reranker model: all-MiniLM-L6-v2")
            _reranker = SentenceTransformer('all-MiniLM-L6-v2')
            logger.info("Reranker loaded successfully")
        except ImportError:
            logger.warning("sentence-transformers not installed — reranking disabled")
            return None
    return _reranker


def _rerank_sync(query: str, chunks: List[ScoredChunk], top_n: int) -> List[ScoredChunk]:
    """
    Synchronous reranking using semantic similarity.
    Scores each chunk based on semantic relevance to query.
    """
    reranker = _get_reranker()

    if reranker is None:
        # Fallback: return top_n by original vector score
        logger.warning("Reranker unavailable — falling back to vector scores")
        return sorted(chunks, key=lambda c: c.score, reverse=True)[:top_n]

    try:
        # Embed query and chunks
        query_embedding = reranker.encode(query, convert_to_tensor=False)
        chunk_texts = [chunk.text for chunk in chunks]
        chunk_embeddings = reranker.encode(chunk_texts, convert_to_tensor=False)

        # Calculate cosine similarity
        scores = []
        for chunk_emb in chunk_embeddings:
            # Cosine similarity
            similarity = np.dot(query_embedding, chunk_emb) / (
                np.linalg.norm(query_embedding) * np.linalg.norm(chunk_emb) + 1e-8
            )
            scores.append(float(similarity))

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
    except Exception as e:
        logger.error("Reranking error: %s", e)
        return sorted(chunks, key=lambda c: c.score, reverse=True)[:top_n]


async def rerank_chunks(
    query: str,
    chunks: List[ScoredChunk],
    top_n: int = TOP_N,
) -> List[ScoredChunk]:
    """
    Async wrapper for reranking.
    Runs the CPU-bound reranking in a thread pool.
    """
    if not chunks:
        return chunks

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _rerank_sync, query, chunks, top_n)
