/**
 * Supabase / Postgres client for the Next.js server layer.
 * Used in API routes only — never imported in browser code.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DocumentRecord, ChatMessage } from '@/types';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // Service role — server-side only
    if (!url || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    }
    _client = createClient(url, key);
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** Create a document record before ingestion starts. */
export async function createDocument(params: {
  id: string;
  namespace: string;
  filename: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
}): Promise<void> {
  const { error } = await getClient()
    .from('documents')
    .insert({ ...params, status: 'pending' });
  if (error) throw new Error(`DB createDocument failed: ${error.message}`);
}

/** Update a document's ingestion status. */
export async function updateDocumentStatus(
  id: string,
  status: DocumentRecord['status'],
  chunks_created?: number,
  errorMsg?: string,
): Promise<void> {
  const { error } = await getClient()
    .from('documents')
    .update({
      status,
      ...(chunks_created !== undefined && { chunks_created }),
      ...(errorMsg !== undefined && { error: errorMsg }),
    })
    .eq('id', id);
  if (error) throw new Error(`DB updateDocumentStatus failed: ${error.message}`);
}

/** List all documents for a namespace. */
export async function listDocuments(namespace: string): Promise<DocumentRecord[]> {
  const { data, error } = await getClient()
    .from('documents')
    .select('*')
    .eq('namespace', namespace)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`DB listDocuments failed: ${error.message}`);
  return data as DocumentRecord[];
}

/** Delete a document record. */
export async function deleteDocument(id: string): Promise<void> {
  const { error } = await getClient().from('documents').delete().eq('id', id);
  if (error) throw new Error(`DB deleteDocument failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Chat history
// ---------------------------------------------------------------------------

/** Save a chat message to history. */
export async function saveChatMessage(params: {
  namespace: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  confidence?: number;
  is_grounded?: boolean;
}): Promise<void> {
  const { error } = await getClient().from('chat_history').insert(params);
  if (error) throw new Error(`DB saveChatMessage failed: ${error.message}`);
}

/** Load the last N turns (pairs of user+assistant) for a session. */
export async function loadChatHistory(
  namespace: string,
  session_id: string,
  turns: number = 4,
): Promise<ChatMessage[]> {
  const limit = turns * 2; // Each turn = 1 user + 1 assistant message
  const { data, error } = await getClient()
    .from('chat_history')
    .select('role, content')
    .eq('namespace', namespace)
    .eq('session_id', session_id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`DB loadChatHistory failed: ${error.message}`);
  // Reverse to chronological order
  return ((data as ChatMessage[]) || []).reverse();
}
