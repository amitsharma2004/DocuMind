"""Pydantic models for the FastAPI service — matches OpenAPI spec exactly."""
from __future__ import annotations

from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, UUID4


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class IngestionStatusEnum(str, Enum):
    pending = "pending"
    processing = "processing"
    complete = "complete"
    failed = "failed"


class MessageRole(str, Enum):
    user = "user"
    assistant = "assistant"


class ErrorCode(str, Enum):
    UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT"
    PARSE_FAILURE = "PARSE_FAILURE"
    EMBEDDING_FAILURE = "EMBEDDING_FAILURE"
    VECTORSTORE_ERROR = "VECTORSTORE_ERROR"
    LLM_TIMEOUT = "LLM_TIMEOUT"
    NOT_FOUND = "NOT_FOUND"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"


# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: MessageRole
    content: str


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------

class IngestionStatus(BaseModel):
    doc_id: str
    status: IngestionStatusEnum
    chunks_created: int = 0
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    query: str = Field(..., max_length=1000, description="Natural language question")
    namespace: str = Field(..., description="Pinecone namespace (user/session ID)")
    top_k: int = Field(default=5, ge=1, le=20)
    chat_history: List[ChatMessage] = Field(
        default_factory=list,
        max_length=8,
        description="Last N turns of conversation (max 4 turns = 8 messages)",
    )


class Citation(BaseModel):
    source_file: str
    page_number: int = Field(
        description="Page number for PDF; 0 for TXT; -1 for DOCX (section heading used instead)"
    )
    section_heading: Optional[str] = None
    chunk_text: str
    score: float


class QueryResponse(BaseModel):
    answer: str
    confidence: float = Field(ge=0.0, le=1.0)
    is_grounded: bool
    citations: List[Citation]


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

class DeleteResponse(BaseModel):
    deleted: bool
    vectors_removed: int


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str
    pinecone: str
    gemini: str


# ---------------------------------------------------------------------------
# Error
# ---------------------------------------------------------------------------

class ErrorResponse(BaseModel):
    error: str
    code: ErrorCode


# ---------------------------------------------------------------------------
# Internal (not in OpenAPI, used within pipeline)
# ---------------------------------------------------------------------------

class PageBlock(BaseModel):
    """Text block for a single page/section extracted from a document."""
    text: str
    page_number: int          # -1 for DOCX
    section_heading: Optional[str] = None


class DocumentChunk(BaseModel):
    """A chunk produced by the chunker, ready for embedding."""
    id: str                   # uuid
    doc_id: str
    source_file: str
    page_number: int
    section_heading: Optional[str] = None
    chunk_index: int
    text: str
    embedding: Optional[List[float]] = None  # 768-dim Gemini vector


class ScoredChunk(BaseModel):
    """A chunk returned by the retriever with its similarity score."""
    doc_id: str
    source_file: str
    page_number: int
    section_heading: Optional[str] = None
    chunk_index: int
    text: str
    score: float
