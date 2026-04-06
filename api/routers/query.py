"""
POST /query — RAG query endpoint.

Flow: Embed query → Retrieve top-K → Confidence guard → GPT-4o → Citations.
If guard fires (max score < threshold), returns is_grounded=false with no LLM call.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from openai import AsyncOpenAI, APITimeoutError

from api.models import QueryRequest, QueryResponse, ChatMessage
from api.services.retriever import retrieve_chunks
from api.services.guard import apply_confidence_guard, I_DONT_KNOW
from api.services.prompt_builder import build_messages
from api.services.citation_builder import build_citations
from api.config import get_settings
from api.dependencies import verify_internal_key

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/query",
    response_model=QueryResponse,
    summary="Query documents with natural language",
)
async def query_documents(
    request: QueryRequest,
    _: None = Depends(verify_internal_key),
):
    """
    RAG query pipeline with pre-LLM confidence guard.
    """
    settings = get_settings()

    # Window chat history to last N turns (N*2 messages)
    window_size = settings.chat_history_window * 2
    windowed_history = request.chat_history[-window_size:]

    # --- Retrieve ---
    try:
        chunks = await retrieve_chunks(
            query=request.query,
            namespace=request.namespace,
            top_k=request.top_k,
        )
    except Exception as e:
        logger.error("Retrieval failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "Retrieval failed.", "code": "VECTORSTORE_ERROR"},
        )

    # --- Confidence guard ---
    is_grounded, max_score = apply_confidence_guard(chunks)

    if not is_grounded:
        return QueryResponse(
            answer=I_DONT_KNOW,
            confidence=round(max_score, 4),
            is_grounded=False,
            citations=[],
        )

    # --- Build prompt and call LLM (OpenAI-compatible endpoint) ---
    messages = build_messages(
        query=request.query,
        chunks=chunks,
        history=windowed_history,
    )

    try:
        client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url or None,  # None = use default OpenAI endpoint
            timeout=settings.llm_timeout_seconds,
        )
        completion = await client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            temperature=0.1,  # Low temperature for factual, grounded answers
            max_tokens=1024,
        )
        answer = completion.choices[0].message.content or I_DONT_KNOW

    except APITimeoutError:
        logger.error("LLM timeout (model=%s) for query='%.60s'", settings.openai_model, request.query)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "LLM response timed out.", "code": "LLM_TIMEOUT"},
        )
    except Exception as e:
        logger.error("LLM call failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "LLM call failed.", "code": "INTERNAL_ERROR"},
        )

    # --- Build citations ---
    citations = build_citations(chunks)

    return QueryResponse(
        answer=answer,
        confidence=round(max_score, 4),
        is_grounded=True,
        citations=citations,
    )
