"""
POST /flashcards — Generate Q&A flashcards from document chunks.

Flow: Retrieve random chunks → LLM generates Q&A pairs → Return flashcards
"""
from __future__ import annotations

import json
import logging
import random

from fastapi import APIRouter, Depends, HTTPException, status
from openai import AsyncOpenAI

from api.models import FlashcardRequest, FlashcardResponse, Flashcard
from api.services.retriever import retrieve_chunks
from api.config import get_settings
from api.dependencies import verify_internal_key

logger = logging.getLogger(__name__)
router = APIRouter()

FLASHCARD_PROMPT = """You are an expert educator. Based on the document excerpts below, generate exactly {count} flashcards.

Each flashcard must have:
- A clear, specific QUESTION about a fact, concept, or detail from the text
- A concise, accurate ANSWER (1-3 sentences max)

Return ONLY a valid JSON array, no extra text:
[
  {{"question": "...", "answer": "..."}},
  ...
]

Document excerpts:
{context}"""


@router.post(
    "/flashcards",
    response_model=FlashcardResponse,
    summary="Generate flashcards from document chunks",
)
async def generate_flashcards(
    request: FlashcardRequest,
    _: None = Depends(verify_internal_key),
):
    settings = get_settings()

    # Fetch chunks using diverse queries to get broad coverage
    seed_queries = [
        "key concepts and definitions",
        "important facts and details",
        "main topics and explanations",
    ]

    all_chunks = []
    seen_ids = set()

    for q in seed_queries:
        chunks = await retrieve_chunks(
            query=q,
            namespace=request.namespace,
            top_k=10,
            filter_doc_ids=request.doc_ids,
        )
        for c in chunks:
            chunk_id = f"{c.doc_id}_{c.chunk_index}"
            if chunk_id not in seen_ids:
                seen_ids.add(chunk_id)
                all_chunks.append(c)

    if not all_chunks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "No document chunks found. Upload and ingest a document first."},
        )

    # Shuffle and pick diverse chunks
    random.shuffle(all_chunks)
    selected = all_chunks[:min(15, len(all_chunks))]
    context = "\n\n---\n\n".join(
        f"[Source: {c.source_file}]\n{c.text}" for c in selected
    )

    prompt = FLASHCARD_PROMPT.format(count=request.count, context=context)

    try:
        client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url or None,
            timeout=60,
        )
        completion = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=2048,
        )
        raw = completion.choices[0].message.content or "[]"

        # Parse JSON — strip markdown code blocks if present
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        data = json.loads(raw)
        cards = [Flashcard(question=item["question"], answer=item["answer"]) for item in data]

    except json.JSONDecodeError as e:
        logger.error("Failed to parse flashcard JSON: %s", e)
        raise HTTPException(status_code=500, detail={"error": "Failed to parse flashcard response."})
    except Exception as e:
        logger.error("Flashcard generation failed: %s", e)
        raise HTTPException(status_code=500, detail={"error": str(e)})

    return FlashcardResponse(cards=cards)
