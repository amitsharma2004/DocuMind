"""
Retriever — embeds a query and fetches top-K chunks from the vector store.
"""
from __future__ import annotations

import logging
from typing import List, Optional

from api.models import ScoredChunk
from api.services.embedder import embed_query
import api.vectorstore as vectorstore
from api.config import get_settings

logger = logging.getLogger(__name__)


async def retrieve_chunks(
    query: str,
    namespace: str,
    top_k: Optional[int] = None,
    filter_doc_ids: Optional[List[str]] = None,
) -> List[ScoredChunk]:
    """
    Embed a user query and retrieve the top-K most similar chunks.

    Args:
        query:          Natural language question.
        namespace:      Vector store namespace to search within.
        top_k:          Number of chunks to return (defaults to config.top_k).
        filter_doc_ids: Restrict search to specific document IDs.

    Returns:
        List of ScoredChunk sorted by similarity score descending.
    """
    settings = get_settings()
    k = top_k or settings.top_k

    # Embed query with retrieval_query task type (asymmetric retrieval)
    query_vector = await embed_query(query)

    chunks = vectorstore.query_vectors(
        embedding=query_vector,
        namespace=namespace,
        top_k=k,
        filter_doc_ids=filter_doc_ids,
    )

    logger.info(
        "Retrieved %d chunks for query='%.60s...' namespace=%s",
        len(chunks),
        query,
        namespace,
    )
    return chunks
