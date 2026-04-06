"""
Prompt builder — assembles the system prompt and context for GPT-4o.

Includes:
- System instructions with citation format requirements
- Retrieved context chunks (with source labels)
- Last N turns of chat history
"""
from __future__ import annotations

from typing import List

from api.models import ChatMessage, ScoredChunk


SYSTEM_PROMPT_TEMPLATE = """You are a precise document analysis assistant. Your job is to answer questions \
based ONLY on the provided document excerpts below.

Rules:
1. Answer strictly using the provided context. Do not use outside knowledge.
2. For every claim, cite the source using the format: [Source: <filename>, Page <page>] or \
[Source: <filename>, Section: <heading>] for DOCX files.
3. If the context does not contain enough information to answer, say exactly: \
"I don't know based on the provided documents."
4. Be concise and precise. Prioritise higher-scoring excerpts.
5. If multiple documents are relevant, synthesise across them clearly.

--- DOCUMENT CONTEXT ---
{context}
--- END CONTEXT ---"""


def _format_chunk_citation(chunk: ScoredChunk) -> str:
    """Format the source label for a chunk."""
    if chunk.page_number == -1 and chunk.section_heading:
        return f"[Source: {chunk.source_file}, Section: {chunk.section_heading}]"
    elif chunk.page_number == 0:
        return f"[Source: {chunk.source_file}]"
    else:
        return f"[Source: {chunk.source_file}, Page {chunk.page_number}]"


def build_messages(
    query: str,
    chunks: List[ScoredChunk],
    history: List[ChatMessage],
) -> List[dict]:
    """
    Build the OpenAI messages array for the chat completion call.

    Args:
        query:   Current user question.
        chunks:  Retrieved context chunks (already confidence-guarded).
        history: Last N chat turns (role + content pairs).

    Returns:
        List of message dicts in OpenAI chat format.
    """
    # Build context string from retrieved chunks
    context_parts = []
    for i, chunk in enumerate(chunks, start=1):
        citation = _format_chunk_citation(chunk)
        context_parts.append(
            f"[Excerpt {i} | Score: {chunk.score:.2f}] {citation}\n{chunk.text}"
        )
    context = "\n\n".join(context_parts)

    system_content = SYSTEM_PROMPT_TEMPLATE.format(context=context)

    messages: List[dict] = [{"role": "system", "content": system_content}]

    # Inject chat history (last N turns, already windowed by the caller)
    for msg in history:
        messages.append({"role": msg.role.value, "content": msg.content})

    # Current question
    messages.append({"role": "user", "content": query})

    return messages
