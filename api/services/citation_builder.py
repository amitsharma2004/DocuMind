"""
Citation builder — maps retrieved ScoredChunks into Citation response objects.

Does not attempt to parse LLM output for inline citations (fragile).
Instead, returns all retrieved context chunks as citations, sorted by score.
The UI can then display them in the citation panel.
"""
from __future__ import annotations

from typing import List

from api.models import Citation, ScoredChunk


def build_citations(chunks: List[ScoredChunk]) -> List[Citation]:
    """
    Convert retrieved ScoredChunks into Citation objects for the API response.

    Args:
        chunks: Top-K scored chunks from the retriever.

    Returns:
        List of Citation sorted by score descending, limited to top 5.
    """
    citations: List[Citation] = []

    for chunk in sorted(chunks, key=lambda c: c.score, reverse=True):
        # Truncate chunk text for display (keep it readable in UI)
        display_text = chunk.text[:300].strip()
        if len(chunk.text) > 300:
            display_text += "..."

        citations.append(Citation(
            source_file=chunk.source_file,
            page_number=chunk.page_number,
            section_heading=chunk.section_heading,
            chunk_text=display_text,
            score=round(chunk.score, 4),
        ))

    return citations
