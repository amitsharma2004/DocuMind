"""
Pinecone vector store client wrapper.

Index must be pre-created with dimension=768 (Gemini text-embedding-004).
Vectors are namespaced by user/session ID for isolation between users.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import List, Optional

from api.config import get_settings
from api.models import DocumentChunk, ScoredChunk

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_index():
    """Lazy-init and cache the Pinecone index connection."""
    try:
        from pinecone import Pinecone
    except ImportError as e:
        raise RuntimeError("pinecone not installed. Run: pip install pinecone") from e

    settings = get_settings()
    pc = Pinecone(api_key=settings.pinecone_api_key)
    index = pc.Index(settings.pinecone_index_name)
    logger.info("Connected to Pinecone index: %s", settings.pinecone_index_name)
    return index


def upsert_chunks(chunks: List[DocumentChunk], namespace: str) -> int:
    """
    Upsert embedded document chunks into Pinecone.

    Args:
        chunks:    Chunks that already have their `embedding` field populated.
        namespace: Pinecone namespace (user/session scope).

    Returns:
        Number of vectors upserted.
    """
    index = _get_index()
    vectors = []
    for chunk in chunks:
        if chunk.embedding is None:
            logger.warning("Chunk %s has no embedding — skipping", chunk.id)
            continue
        vectors.append({
            "id": chunk.id,
            "values": chunk.embedding,
            "metadata": {
                "doc_id": chunk.doc_id,
                "source_file": chunk.source_file,
                "page_number": chunk.page_number,
                "section_heading": chunk.section_heading or "",
                "chunk_index": chunk.chunk_index,
                "text": chunk.text[:1000],  # Pinecone metadata value cap
            },
        })

    if not vectors:
        return 0

    # Batch upsert in groups of 100 (Pinecone recommended batch size)
    batch_size = 100
    total = 0
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i : i + batch_size]
        index.upsert(vectors=batch, namespace=namespace)
        total += len(batch)

    logger.info("Upserted %d vectors to namespace=%s", total, namespace)
    return total


def query_vectors(
    embedding: List[float],
    namespace: str,
    top_k: int = 5,
    filter_doc_ids: Optional[List[str]] = None,
) -> List[ScoredChunk]:
    """
    Retrieve top-K similar chunks from Pinecone.

    Args:
        embedding:      768-dim query vector.
        namespace:      Pinecone namespace to search within.
        top_k:          Number of results to return.
        filter_doc_ids: Optional list of doc_ids to restrict search to.

    Returns:
        List of ScoredChunk sorted by score descending.
    """
    index = _get_index()

    pinecone_filter = None
    if filter_doc_ids:
        pinecone_filter = {"doc_id": {"$in": filter_doc_ids}}

    response = index.query(
        vector=embedding,
        top_k=top_k,
        namespace=namespace,
        include_metadata=True,
        filter=pinecone_filter,
    )

    results: List[ScoredChunk] = []
    for match in response.matches:
        meta = match.metadata or {}
        results.append(ScoredChunk(
            doc_id=meta.get("doc_id", ""),
            source_file=meta.get("source_file", ""),
            page_number=meta.get("page_number", 0),
            section_heading=meta.get("section_heading") or None,
            chunk_index=meta.get("chunk_index", 0),
            text=meta.get("text", ""),
            score=float(match.score),
        ))

    return results


def delete_document_vectors(doc_id: str, namespace: str) -> int:
    """
    Delete all vectors associated with a document from Pinecone.

    Returns the count of vectors deleted (approximate via fetch-first strategy).
    """
    index = _get_index()

    # Fetch IDs by metadata filter, then delete
    # Note: Pinecone serverless supports delete by metadata filter directly
    try:
        index.delete(
            filter={"doc_id": {"$eq": doc_id}},
            namespace=namespace,
        )
        logger.info("Deleted vectors for doc_id=%s from namespace=%s", doc_id, namespace)
        return -1  # Exact count unavailable with filter delete; -1 = unknown
    except Exception as e:
        logger.error("Failed to delete vectors for doc_id=%s: %s", doc_id, e)
        raise


def check_connection() -> str:
    """Health check — returns 'connected' or error message."""
    try:
        _get_index().describe_index_stats()
        return "connected"
    except Exception as e:
        return f"error: {e}"
