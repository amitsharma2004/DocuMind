/**
 * POST /api/query
 *
 * Proxy to FastAPI POST /query.
 * Loads last N turns of chat history from Postgres and passes to FastAPI.
 * Persists both the user question and assistant answer to Postgres after the call.
 */
import { NextRequest, NextResponse } from 'next/server';
import { loadChatHistory, saveChatMessage } from '@/lib/db/client';
import { QueryResponse } from '@/types';

const FASTAPI_URL = process.env.FASTAPI_URL ?? 'http://localhost:8000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? '';
const CHAT_HISTORY_WINDOW = parseInt(process.env.CHAT_HISTORY_WINDOW ?? '4', 10);

export async function POST(req: NextRequest) {
  let body: { query: string; namespace: string; session_id: string; top_k?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { query, namespace, session_id, top_k } = body;
  if (!query?.trim()) return NextResponse.json({ error: 'query is required.' }, { status: 400 });
  if (!namespace) return NextResponse.json({ error: 'namespace is required.' }, { status: 400 });
  if (!session_id) return NextResponse.json({ error: 'session_id is required.' }, { status: 400 });

  // --- Load windowed chat history from Postgres ---
  let chatHistory: { role: 'user' | 'assistant'; content: string }[] = [];
  try {
    chatHistory = await loadChatHistory(namespace, session_id, CHAT_HISTORY_WINDOW);
  } catch (e) {
    console.warn('[query] Could not load chat history:', e);
    // Non-fatal — proceed with empty history
  }

  // --- Save user message to Postgres ---
  try {
    await saveChatMessage({ namespace, session_id, role: 'user', content: query });
  } catch (e) {
    console.warn('[query] Could not save user message:', e);
  }

  // --- Call FastAPI /query ---
  let result: QueryResponse;
  try {
    const resp = await fetch(`${FASTAPI_URL}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-API-Key': INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        query,
        namespace,
        top_k: top_k ?? 5,
        chat_history: chatHistory,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.json().catch(() => ({}));
      return NextResponse.json(
        { error: detail?.detail?.error || 'Query failed.' },
        { status: resp.status },
      );
    }

    result = await resp.json();
  } catch (e: any) {
    console.error('[query] FastAPI error:', e);
    return NextResponse.json({ error: 'Query service unreachable.' }, { status: 502 });
  }

  // --- Persist assistant response to Postgres ---
  try {
    await saveChatMessage({
      namespace,
      session_id,
      role: 'assistant',
      content: result.answer,
      confidence: result.confidence,
      is_grounded: result.is_grounded,
    });
  } catch (e) {
    console.warn('[query] Could not save assistant message:', e);
  }

  return NextResponse.json(result, { status: 200 });
}
