'use client';

import { Citation } from '@/types';

interface CitationCardProps {
  citation: Citation;
  index: number;
}

/** Renders a single source citation with file name, page/section, excerpt and score. */
export default function CitationCard({ citation, index }: CitationCardProps) {
  const locationLabel =
    citation.page_number === -1 && citation.section_heading
      ? `Section: ${citation.section_heading}`
      : citation.page_number === 0
      ? 'Full document'
      : `Page ${citation.page_number}`;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 font-medium text-slate-700 truncate">
          <span className="shrink-0 text-xs text-slate-400 font-mono">[{index}]</span>
          <span className="truncate" title={citation.source_file}>
            📄 {citation.source_file}
          </span>
        </div>
        <span className="shrink-0 text-xs text-slate-500 font-mono whitespace-nowrap">
          {Math.round(citation.score * 100)}%
        </span>
      </div>

      <div className="text-xs text-slate-500 mb-2">{locationLabel}</div>

      <blockquote className="border-l-2 border-slate-300 pl-2 text-slate-600 italic text-xs leading-relaxed line-clamp-3">
        {citation.chunk_text}
      </blockquote>
    </div>
  );
}
