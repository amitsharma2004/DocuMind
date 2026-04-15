"""
Confidence guard — the core portfolio differentiator.

Fires BEFORE the LLM call. If the max cosine similarity score across all
retrieved chunks is below CONFIDENCE_THRESHOLD, we return is_grounded=False
and the standard "I don't know" message. No tokens are wasted on a hallucinated answer.
"""
from __future__ import annotations

import logging
from typing import List, Tuple

from api.models import ScoredChunk
from api.config import get_settings

logger = logging.getLogger(__name__)

I_DONT_KNOW = "I don't know based on the provided documents."

# Below this score even warning prompt won't fire — truly no relevant context
NO_CONTEXT_THRESHOLD = 0.3


def apply_confidence_guard(
    chunks: List[ScoredChunk],
    threshold: float | None = None,
) -> Tuple[bool, float]:
    """
    Returns:
        (is_grounded, max_score)
        - is_grounded=True  → high confidence, proceed to normal LLM
        - is_grounded=False → low/no confidence
    """
    settings = get_settings()
    effective_threshold = threshold if threshold is not None else settings.confidence_threshold

    if not chunks:
        logger.info("Guard fired: no chunks retrieved (max_score=0.0, threshold=%.2f)", effective_threshold)
        return False, 0.0

    max_score = max(c.score for c in chunks)

    is_grounded = max_score >= effective_threshold
    if not is_grounded:
        logger.info(
            "Guard fired: max_score=%.4f < threshold=%.2f — using warning prompt",
            max_score,
            effective_threshold,
        )
    else:
        logger.info(
            "Guard passed: max_score=%.4f >= threshold=%.2f — proceeding to LLM",
            max_score,
            effective_threshold,
        )

    return is_grounded, max_score


def has_any_context(chunks: List[ScoredChunk]) -> bool:
    """True if there's at least some weak context worth sending to LLM with warning prompt."""
    if not chunks:
        return False
    return max(c.score for c in chunks) >= NO_CONTEXT_THRESHOLD
