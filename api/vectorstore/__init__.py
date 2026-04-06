"""
Vector store router — selects Pinecone or Chroma based on VECTOR_STORE env var.
Import everything from here so the rest of the app stays store-agnostic.
"""
from api.config import get_settings


def _store():
    settings = get_settings()
    if settings.vector_store.lower() == "chroma":
        from api.vectorstore import chroma_client as _client
    else:
        from api.vectorstore import pinecone_client as _client
    return _client


def upsert_chunks(chunks, namespace: str) -> int:
    return _store().upsert_chunks(chunks, namespace)


def query_vectors(embedding, namespace: str, top_k: int = 5, filter_doc_ids=None):
    return _store().query_vectors(embedding, namespace, top_k, filter_doc_ids)


def delete_document_vectors(doc_id: str, namespace: str) -> int:
    return _store().delete_document_vectors(doc_id, namespace)


def check_connection() -> str:
    return _store().check_connection()
