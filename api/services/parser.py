"""
Document parser — extracts page-segmented text from PDF, DOCX, and TXT files.

PDF  → page boundaries from PyMuPDF (fitz)
DOCX → section headings as citation anchors (no native page concept)
TXT  → single block, page_number=0
"""
from __future__ import annotations

import io
import logging
from typing import List

from api.models import PageBlock

logger = logging.getLogger(__name__)

SUPPORTED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
}

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt"}


def parse_document(file_bytes: bytes, mime_type: str, filename: str = "") -> List[PageBlock]:
    """
    Parse a document buffer into a list of PageBlock objects.

    Args:
        file_bytes: Raw file content.
        mime_type:  MIME type string.
        filename:   Original filename (used for extension fallback).

    Returns:
        List of PageBlock with text, page_number, and optional section_heading.

    Raises:
        ValueError: If the format is unsupported or the file is unreadable.
    """
    mime = mime_type.lower().strip()

    # Fallback: infer type from filename extension
    if mime not in SUPPORTED_MIME_TYPES:
        ext = _ext(filename)
        if ext == ".pdf":
            mime = "application/pdf"
        elif ext == ".docx":
            mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif ext == ".txt":
            mime = "text/plain"
        else:
            raise ValueError(f"Unsupported file type: {mime_type or ext}")

    if mime == "application/pdf":
        return _parse_pdf(file_bytes)
    elif mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return _parse_docx(file_bytes)
    else:
        return _parse_txt(file_bytes)


def _ext(filename: str) -> str:
    import os
    return os.path.splitext(filename.lower())[1]


def _parse_pdf(file_bytes: bytes) -> List[PageBlock]:
    """Use PyMuPDF for reliable page-boundary extraction."""
    try:
        import fitz  # PyMuPDF
    except ImportError as e:
        raise RuntimeError("PyMuPDF not installed. Run: pip install pymupdf") from e

    blocks: List[PageBlock] = []
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text("text").strip()
            if text:
                blocks.append(PageBlock(
                    text=text,
                    page_number=page_num + 1,  # 1-indexed for human display
                    section_heading=None,
                ))
        doc.close()
    except Exception as e:
        logger.error("PDF parse failed: %s", e)
        raise ValueError(f"Failed to parse PDF: {e}") from e

    if not blocks:
        raise ValueError("PDF produced no extractable text (may be scanned/image-only).")
    return blocks


def _parse_docx(file_bytes: bytes) -> List[PageBlock]:
    """
    Extract text from DOCX, grouping paragraphs under their nearest heading.
    DOCX has no page concept — headings become citation anchors.
    page_number is always -1 for DOCX chunks.
    """
    try:
        from docx import Document
    except ImportError as e:
        raise RuntimeError("python-docx not installed. Run: pip install python-docx") from e

    try:
        doc = Document(io.BytesIO(file_bytes))
    except Exception as e:
        raise ValueError(f"Failed to parse DOCX: {e}") from e

    blocks: List[PageBlock] = []
    current_heading: str = "Document Start"
    current_texts: List[str] = []

    heading_styles = {"heading 1", "heading 2", "heading 3", "heading 4", "title"}

    for para in doc.paragraphs:
        style_name = para.style.name.lower() if para.style else ""
        text = para.text.strip()

        if not text:
            continue

        if any(h in style_name for h in heading_styles):
            # Flush current section before starting new one
            if current_texts:
                blocks.append(PageBlock(
                    text=" ".join(current_texts),
                    page_number=-1,
                    section_heading=current_heading,
                ))
                current_texts = []
            current_heading = text
        else:
            current_texts.append(text)

    # Flush final section
    if current_texts:
        blocks.append(PageBlock(
            text=" ".join(current_texts),
            page_number=-1,
            section_heading=current_heading,
        ))

    if not blocks:
        raise ValueError("DOCX produced no extractable text.")
    return blocks


def _parse_txt(file_bytes: bytes) -> List[PageBlock]:
    """Plain text — single block, page_number=0."""
    try:
        text = file_bytes.decode("utf-8", errors="replace").strip()
    except Exception as e:
        raise ValueError(f"Failed to decode TXT file: {e}") from e

    if not text:
        raise ValueError("TXT file is empty.")
    return [PageBlock(text=text, page_number=0, section_heading=None)]
