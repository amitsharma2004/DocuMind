"""
Recursive character-based chunker with overlap.

Uses LangChain's RecursiveCharacterTextSplitter under the hood so we benefit
from battle-tested separator logic (paragraphs → sentences → words → chars).
Each chunk is tagged with doc_id, source_file, page_number, section_heading,
and a sequential chunk_index.
"""
from __future__ import annotations

import uuid
import logging
from typing import List

from api.models import DocumentChunk, PageBlock
from api.config import get_settings

logger = logging.getLogger(__name__)


def chunk_document(
    pages: List[PageBlock],
    doc_id: str,
    source_file: str,
) -> List[DocumentChunk]:
    """
    Split a list of PageBlocks into overlapping DocumentChunks.

    Args:
        pages:       Page/section blocks from the parser.
        doc_id:      UUID of the parent document.
        source_file: Original filename for citations.

    Returns:
        Ordered list of DocumentChunk objects ready for embedding.
    """
    settings = get_settings()

    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter
    except ImportError as e:
        raise RuntimeError(
            "langchain-text-splitters not installed. Run: pip install langchain-text-splitters"
        ) from e

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        length_function=len,  # character-based; acceptable for MVP
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    chunks: List[DocumentChunk] = []
    chunk_index = 0

    for page in pages:
        if not page.text.strip():
            continue

        raw_chunks = splitter.split_text(page.text)

        for raw in raw_chunks:
            text = raw.strip()
            if not text:
                continue
            chunks.append(DocumentChunk(
                id=str(uuid.uuid4()),
                doc_id=doc_id,
                source_file=source_file,
                page_number=page.page_number,
                section_heading=page.section_heading,
                chunk_index=chunk_index,
                text=text,
            ))
            chunk_index += 1

    logger.info(
        "Chunked doc_id=%s into %d chunks (chunk_size=%d, overlap=%d)",
        doc_id,
        len(chunks),
        settings.chunk_size,
        settings.chunk_overlap,
    )
    return chunks
