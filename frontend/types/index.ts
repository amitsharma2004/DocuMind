/** Shared TypeScript types — mirrors OpenAPI spec and Python models. */

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface Citation {
  source_file: string;
  page_number: number;       // -1 for DOCX; 0 for TXT
  section_heading?: string;  // DOCX citation anchor
  chunk_text: string;
  score: number;
}

export interface QueryResponse {
  answer: string;
  confidence: number;
  is_grounded: boolean;
  citations: Citation[];
}

export interface IngestionStatus {
  doc_id: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  chunks_created: number;
  error?: string | null;
}

/** Chat message as displayed in the UI (adds metadata). */
export interface UIMessage extends ChatMessage {
  id: string;
  timestamp: Date;
  confidence?: number;
  citations?: Citation[];
  is_grounded?: boolean;
  isLoading?: boolean;
}

/** Document record stored in Postgres and listed in the UI. */
export interface DocumentRecord {
  id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  chunks_created: number;
  created_at: string;
  error?: string | null;
}
