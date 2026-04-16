"""
FastAPI entry point for the Business Document Intelligence microservice.

Endpoints:
  POST   /ingest               — Document ingestion pipeline
  POST   /query                — RAG query pipeline
  DELETE /documents/{doc_id}   — Remove document vectors
  GET    /health               — Service health check
"""
from __future__ import annotations

import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import ingest, query, documents, flashcards, mindmap
import api.vectorstore as vectorstore
from api.services.embedder import _configure_client as configure_gemini
from api.models import HealthResponse
from api.config import get_settings

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Business Document Intelligence — Ingestion & Query API",
    version="1.0.0",
    description=(
        "FastAPI microservice exposing document ingestion and RAG query endpoints. "
        "Consumed by the Next.js API layer. All credentials are server-side only."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

# Allow Next.js dev server to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://*.deploy.ai"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(ingest.router, tags=["Ingestion"])
app.include_router(query.router, tags=["Query"])
app.include_router(documents.router, tags=["Documents"])
app.include_router(flashcards.router, tags=["Flashcards"])
app.include_router(mindmap.router, tags=["Mindmap"])


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Check connectivity to Pinecone/Chroma and Gemini."""
    settings = get_settings()

    # Gemini check
    try:
        configure_gemini()
        gemini_status = "connected"
    except Exception as e:
        gemini_status = f"error: {e}"

    # Vector store check
    pinecone_status = vectorstore.check_connection()

    return HealthResponse(
        status="ok",
        pinecone=pinecone_status,
        gemini=gemini_status,
    )


# ---------------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
async def root():
    return {"service": "doc-intelligence-api", "version": "1.0.0", "docs": "/docs"}
