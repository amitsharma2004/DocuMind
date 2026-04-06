"""
Chroma vector store client — local dev / fallback.

Uses the same interface as pinecone_client so the rest of the codebase
can swap between stores via the VECTOR_STORE env var.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import List, Optional

from api.config import get_settings
from api.models import DocumentChunk, ScoredChunk

logger = logging.getLogger(__name__)

COLLECTION_NAME = "doc_intelligence"


@lru_cache(maxsize=1)
def _get_collection():
    """Lazy-init and cache the Chroma collection."""
    try:
        import chromadb
    except ImportError as e:
        raise RuntimeError("chromadb not installed. Run: pip install chromadb") from e

    settings = get_settings()
    client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    logger.info("Chroma collection ready: %s (persist_dir=%s)", COLLECTION_NAME, settings.chroma_persist_dir)
    return collection


def upsert_chunks(chunks: List[DocumentChunk], namespace: str) -> int:
    """Upsert chunks into Chroma. Namespace is encoded into the vector ID prefix."""
    collection = _get_collection()
    ids, embeddings, metadatas, documents = [], [], [], []

    for chunk in chunks:
        if chunk.embedding is None:
            logger.warning("Chunk %s has no embedding — skipping", chunk.id)
            continue
        # Prefix ID with namespace for scoped deletion
        scoped_id = f"{namespace}::{chunk.id}"
        ids.append(scoped_id)
        embeddings.append(chunk.embedding)
        documents.append(chunk.text)
        metadatas.append({
            "namespace": namespace,
            "doc_id": chunk.doc_id,
            "source_file": chunk.source_file,
            "page_number": chunk.page_number,
            "section_heading": chunk.section_heading or "",
            "chunk_index": chunk.chunk_index,
        })

    if not ids:
        return 0

    collection.upsert(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas)
    logger.info("Upserted %d vectors to Chroma (namespace=%s)", len(ids), namespace)
    return len(ids)


def query_vectors(
    embedding: List[float],
    namespace: str,
    top_k: int = 5,
    filter_doc_ids: Optional[List[str]] = None,
) -> List[ScoredChunk]:
    """Retrieve top-K chunks from Chroma with optional doc_id filter."""
    collection = _get_collection()

    where: dict = {"namespace": {"$eq": namespace}}
    if filter_doc_ids:
        where["doc_id"] = {"$in": filter_doc_ids}

    results = collection.query(
        query_embeddings=[embedding],
        n_results=top_k,
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    scored: List[ScoredChunk] = []
    if not results["ids"][0]:
        return scored

    for i, doc_id_key in enumerate(results["ids"][0]):
        meta = results["metadatas"][0][i]
        text = results["documents"][0][i]
        # Chroma returns L2/cosine distance — convert cosine distance to similarity
        distance = results["distances"][0][i]
        score = 1.0 - distance  # cosine distance → cosine similarity

        scored.append(ScoredChunk(
            doc_id=meta.get("doc_id", ""),
            source_file=meta.get("source_file", ""),
            page_number=meta.get("page_number", 0),
            section_heading=meta.get("section_heading") or None,
            chunk_index=meta.get("chunk_index", 0),
            text=text,
            score=score,
        ))

    return scored


def delete_document_vectors(doc_id: str, namespace: str) -> int:
    """Delete all vectors for a document within a namespace."""
    collection = _get_collection()
    collection.delete(where={"doc_id": {"$eq": doc_id}, "namespace": {"$eq": namespace}})
    logger.info("Deleted Chroma vectors for doc_id=%s namespace=%s", doc_id, namespace)
    return -1  # Exact count unavailable


def check_connection() -> str:
    """Health check."""
    try:
        _get_collection()
        return "connected (chroma)"
    except Exception as e:
        return f"error: {e}"
