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
from api.services.reranker import rerank_chunks
from api.services.guard import apply_confidence_guard, has_any_context, I_DONT_KNOW
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

    # --- Retrieve top-15 candidates ---
    try:
        candidates = await retrieve_chunks(
            query=request.query,
            namespace=request.namespace,
            top_k=15,                      # fetch more for reranker
            filter_doc_ids=request.filter_doc_ids,
        )
    except Exception as e:
        logger.error("Retrieval failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "Retrieval failed.", "code": "VECTORSTORE_ERROR"},
        )

    # --- BGE Rerank: top-15 → top-5 ---
    try:
        chunks = await rerank_chunks(query=request.query, chunks=candidates, top_n=request.top_k)
    except Exception as e:
        logger.warning("Reranking failed, falling back to vector scores: %s", e)
        chunks = sorted(candidates, key=lambda c: c.score, reverse=True)[:request.top_k]

    # --- Confidence guard ---
    is_grounded, max_score = apply_confidence_guard(chunks)

    # Truly no context — return fallback immediately
    if not is_grounded and not has_any_context(chunks):
        return QueryResponse(
            answer=I_DONT_KNOW,
            confidence=round(max_score, 4),
            is_grounded=False,
            citations=[],
        )

    # Low confidence but some context — use warning prompt
    use_warning = not is_grounded

    # --- Build prompt and call LLM ---
    messages = build_messages(
        query=request.query,
        chunks=chunks,
        history=windowed_history,
        use_warning_prompt=use_warning,
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

        # --- Log token usage ---
        usage = completion.usage
        if usage:
            prompt_tokens = usage.prompt_tokens
            completion_tokens = usage.completion_tokens
            total_tokens = usage.total_tokens
            # Cost estimates (Groq gpt-oss-20b is free, but log for reference)
            # Claude 3 Haiku rates: $0.25/1M input, $1.25/1M output
            input_cost  = (prompt_tokens / 1_000_000) * 0.25
            output_cost = (completion_tokens / 1_000_000) * 1.25
            logger.info(
                "TOKEN USAGE | input=%d output=%d total=%d | "
                "est_cost(Haiku)=$%.6f | model=%s",
                prompt_tokens, completion_tokens, total_tokens,
                input_cost + output_cost,
                settings.openai_model,
            )

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
        is_grounded=is_grounded,
        citations=citations,
    )
