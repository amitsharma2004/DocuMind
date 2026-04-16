"""
POST /mindmap — Generate mind map from document chunks.

Flow: Retrieve chunks → LLM generates structured mind map JSON → Return graph data
"""
from __future__ import annotations

import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from openai import AsyncOpenAI

from api.models import QueryRequest, ChatMessage
from api.services.retriever import retrieve_chunks
from api.config import get_settings
from api.dependencies import verify_internal_key

logger = logging.getLogger(__name__)
router = APIRouter()

MINDMAP_PROMPT = """You are an expert at creating structured mind maps. Based on the document excerpts below, create a comprehensive mind map.

Return ONLY a valid JSON object with this exact structure:
{{
  "title": "Main topic from the document",
  "nodes": [
    {{
      "id": "node_1",
      "label": "Main concept",
      "children": ["node_2", "node_3"]
    }},
    {{
      "id": "node_2",
      "label": "Sub-concept 1",
      "children": ["node_4"]
    }},
    {{
      "id": "node_3",
      "label": "Sub-concept 2",
      "children": []
    }},
    {{
      "id": "node_4",
      "label": "Detail",
      "children": []
    }}
  ]
}}

Rules:
- Create 5-15 nodes maximum
- Use clear, concise labels (max 50 chars)
- Build a hierarchical tree structure
- Each node must have unique id and children array
- Root node should have most children

Document excerpts:
{context}"""


class MindmapRequest(QueryRequest):
    pass


@router.post(
    "/mindmap",
    response_model=dict,
    summary="Generate mind map from document chunks",
)
async def generate_mindmap(
    request: MindmapRequest,
    _: None = Depends(verify_internal_key),
):
    settings = get_settings()

    # Retrieve chunks
    try:
        chunks = await retrieve_chunks(
            query=request.query,
            namespace=request.namespace,
            top_k=10,
            filter_doc_ids=request.filter_doc_ids,
        )
    except Exception as e:
        logger.error("Retrieval failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "Retrieval failed."},
        )

    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "No document chunks found."},
        )

    # Build context
    context = "\n\n---\n\n".join(
        f"[Source: {c.source_file}]\n{c.text}" for c in chunks[:8]
    )

    prompt = MINDMAP_PROMPT.format(context=context)

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
        raw = completion.choices[0].message.content or "{}"

        # Parse JSON
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        data = json.loads(raw)
        
        # Validate structure
        if "title" not in data or "nodes" not in data:
            raise ValueError("Invalid mindmap structure")

        return data

    except json.JSONDecodeError as e:
        logger.error("Failed to parse mindmap JSON: %s", e)
        raise HTTPException(status_code=500, detail={"error": "Failed to parse mindmap response."})
    except Exception as e:
        logger.error("Mindmap generation failed: %s", e)
        raise HTTPException(status_code=500, detail={"error": str(e)})
