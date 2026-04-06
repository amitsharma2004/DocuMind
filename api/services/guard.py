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


def apply_confidence_guard(
    chunks: List[ScoredChunk],
    threshold: float | None = None,
) -> Tuple[bool, float]:
    """
    Evaluate whether retrieved chunks meet the confidence threshold.

    Args:
        chunks:    Chunks from the retriever, sorted by score descending.
        threshold: Override the default threshold (from config).

    Returns:
        (is_grounded, max_score)
        - is_grounded=True  → proceed to LLM
        - is_grounded=False → return I_DONT_KNOW, skip LLM
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
            "Guard fired: max_score=%.4f < threshold=%.2f — returning I don't know",
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
