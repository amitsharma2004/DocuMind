"""
DELETE /documents/{doc_id} — remove a document's vectors from the vector store.
File deletion from S3/Supabase is handled by Next.js.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.models import DeleteResponse
import api.vectorstore as vectorstore
from api.dependencies import verify_internal_key

logger = logging.getLogger(__name__)
router = APIRouter()


@router.delete(
    "/documents/{doc_id}",
    response_model=DeleteResponse,
    summary="Delete document vectors",
)
async def delete_document(
    doc_id: str,
    namespace: str = Query(..., description="Pinecone namespace scoping the document"),
    _: None = Depends(verify_internal_key),
):
    """Delete all vector store entries for a given document ID."""
    try:
        vectors_removed = vectorstore.delete_document_vectors(doc_id, namespace)
    except Exception as e:
        logger.error("Failed to delete vectors for doc_id=%s: %s", doc_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": f"Failed to delete document vectors: {e}", "code": "VECTORSTORE_ERROR"},
        )

    logger.info("Deleted vectors for doc_id=%s namespace=%s", doc_id, namespace)
    return DeleteResponse(deleted=True, vectors_removed=vectors_removed)
