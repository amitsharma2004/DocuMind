'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { UIMessage, QueryResponse } from '@/types';
import CitationCard from './CitationCard';
import ConfidenceBadge from './ConfidenceBadge';

interface ChatWindowProps {
  namespace: string;
}

export default function ChatWindow({ namespace }: ChatWindowProps) {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => uuidv4());
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleCitations = useCallback((msgId: string) => {
    setExpandedCitations((prev) => {
      const next = new Set(prev);
      next.has(msgId) ? next.delete(msgId) : next.add(msgId);
      return next;
    });
  }, []);

  const sendMessage = useCallback(async () => {
    const query = input.trim();
    if (!query || isLoading) return;

    const userMsgId = uuidv4();
    const assistantMsgId = uuidv4();

    // Append user message
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: query, timestamp: new Date() },
    ]);
    setInput('');
    setIsLoading(true);

    // Optimistic loading placeholder
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: 'assistant', content: '', timestamp: new Date(), isLoading: true },
    ]);

    try {
      const resp = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, namespace, session_id: sessionId }),
      });

      const json: QueryResponse | { error: string } = await resp.json();

      if (!resp.ok || 'error' in json) {
        const errMsg = ('error' in json ? json.error : null) || 'Query failed.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: `⚠️ ${errMsg}`, isLoading: false }
              : m,
          ),
        );
        return;
      }

      const result = json as QueryResponse;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: result.answer,
                confidence: result.confidence,
                citations: result.citations,
                is_grounded: result.is_grounded,
                isLoading: false,
              }
            : m,
        ),
      );
    } catch (e: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `⚠️ ${e.message}`, isLoading: false }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, namespace, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 mt-16">
            <div className="text-4xl mb-3">💬</div>
            <p className="font-medium">Ask a question about your documents</p>
            <p className="text-sm mt-1">Upload documents using the panel on the left first</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
              {/* Bubble */}
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
                  ${msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                  }`}
              >
                {msg.isLoading ? (
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                  </span>
                ) : (
                  msg.content
                )}
              </div>

              {/* Metadata row (assistant only) */}
              {msg.role === 'assistant' && !msg.isLoading && msg.confidence !== undefined && (
                <div className="flex items-center gap-2 px-1">
                  <ConfidenceBadge score={msg.confidence} isGrounded={msg.is_grounded ?? false} />
                  {msg.citations && msg.citations.length > 0 && (
                    <button
                      onClick={() => toggleCitations(msg.id)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {expandedCitations.has(msg.id) ? 'Hide' : 'Show'} {msg.citations.length} source{msg.citations.length !== 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              )}

              {/* Citations panel */}
              {msg.role === 'assistant' &&
                expandedCitations.has(msg.id) &&
                msg.citations &&
                msg.citations.length > 0 && (
                  <div className="space-y-2 w-full mt-1">
                    {msg.citations.map((cit, i) => (
                      <CitationCard key={i} citation={cit} index={i + 1} />
                    ))}
                  </div>
                )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 p-4">
        <div className="flex gap-2 items-end">
          <textarea
            className="flex-1 resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              min-h-[48px] max-h-[150px]"
            placeholder="Ask a question about your documents…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="shrink-0 rounded-xl bg-blue-600 text-white px-4 py-3 text-sm font-medium
              hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '…' : 'Send'}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2 text-center">
          Answers are grounded in your documents. Low-confidence queries return "I don't know."
        </p>
      </div>
    </div>
  );
}
