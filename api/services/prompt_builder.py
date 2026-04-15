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

WARNING_PROMPT_TEMPLATE = """You are given a question and some retrieved context.
The context may not fully answer the question.

Instructions:
- Use ONLY the context below
- If partial info is available, answer partially
- Mention uncertainty clearly
- Do NOT hallucinate
- At the end, add: Confidence: High / Medium / Low

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
    use_warning_prompt: bool = False,
) -> List[dict]:
    # Filter out low-quality chunks before sending to LLM
    # Normal mode: only chunks above 0.5, Warning mode: above 0.25
    score_cutoff = 0.25 if use_warning_prompt else 0.5
    filtered_chunks = [c for c in chunks if c.score >= score_cutoff] or chunks[:2]

    context_parts = []
    for i, chunk in enumerate(filtered_chunks, start=1):
        citation = _format_chunk_citation(chunk)
        context_parts.append(
            f"[Excerpt {i} | Score: {chunk.score:.2f}] {citation}\n{chunk.text}"
        )
    context = "\n\n".join(context_parts)

    template = WARNING_PROMPT_TEMPLATE if use_warning_prompt else SYSTEM_PROMPT_TEMPLATE
    system_content = template.format(context=context)

    messages: List[dict] = [{"role": "system", "content": system_content}]

    for msg in history:
        messages.append({"role": msg.role.value, "content": msg.content})

    messages.append({"role": "user", "content": query})

    return messages
