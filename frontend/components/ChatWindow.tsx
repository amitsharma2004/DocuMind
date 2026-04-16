'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { UIMessage, QueryResponse } from '@/types';
import CitationCard from './CitationCard';
import ConfidenceBadge from './ConfidenceBadge';
import MindmapView from './MindmapView';
import { SendIcon, MenuIcon, SunIcon, MoonIcon, BrainIcon, ChevronDownIcon, ChevronUpIcon } from './Icons';

interface ChatWindowProps {
  namespace: string;
  filterDocIds?: string[];
}

export default function ChatWindow({ namespace, filterDocIds }: ChatWindowProps) {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => uuidv4());
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());
  const [showMindmap, setShowMindmap] = useState(false);
  const [mindmapQuery, setMindmapQuery] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

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

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: query, timestamp: new Date() },
    ]);
    setInput('');
    setIsLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: 'assistant', content: '', timestamp: new Date(), isLoading: true },
    ]);

    try {
      const resp = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query, namespace, session_id: sessionId,
          ...(filterDocIds?.length && { filter_doc_ids: filterDocIds }),
        }),
      });

      const json: QueryResponse | { error: string } = await resp.json();

      if (!resp.ok || 'error' in json) {
        const errMsg = ('error' in json ? json.error : null) || 'Query failed.';
        setMessages((prev) => prev.map((m) =>
          m.id === assistantMsgId ? { ...m, content: `⚠️ ${errMsg}`, isLoading: false } : m
        ));
        return;
      }

      const result = json as QueryResponse;
      setMessages((prev) => prev.map((m) =>
        m.id === assistantMsgId
          ? { ...m, content: result.answer, confidence: result.confidence, citations: result.citations, is_grounded: result.is_grounded, isLoading: false }
          : m
      ));
    } catch (e: any) {
      setMessages((prev) => prev.map((m) =>
        m.id === assistantMsgId ? { ...m, content: `⚠️ ${e.message}`, isLoading: false } : m
      ));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, namespace, sessionId, filterDocIds]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950 transition-colors duration-200">

      {/* Filter banner */}
      {filterDocIds && filterDocIds.length > 0 && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
          <span>🔍</span>
          <span>Searching in <strong>{filterDocIds.length}</strong> selected doc{filterDocIds.length !== 1 ? 's' : ''} — deselect from sidebar to search all</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center mt-20">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl mb-4 shadow-lg">
              🤖
            </div>
            <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">How can I help you today?</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-sm">
              Upload documents from the sidebar and ask questions — I'll answer with citations.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>

            {/* AI avatar */}
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1 shadow">
                AI
              </div>
            )}

            <div className={`flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end max-w-[75%]' : 'items-start max-w-[82%]'}`}>

              {/* Bubble */}
              <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm
                ${msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-tl-sm'
                }`}
              >
                {msg.isLoading ? (
                  <span className="inline-flex gap-1 py-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  </span>
                ) : msg.role === 'assistant' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none
                    prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5
                    prose-table:text-xs prose-th:bg-gray-100 dark:prose-th:bg-gray-700
                    prose-th:px-3 prose-th:py-1.5 prose-td:px-3 prose-td:py-1.5
                    prose-td:border prose-th:border prose-table:border-collapse
                    prose-code:bg-gray-100 dark:prose-code:bg-gray-700 prose-code:px-1 prose-code:rounded">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>

              {/* Metadata */}
              {msg.role === 'assistant' && !msg.isLoading && msg.confidence !== undefined && (
                <div className="flex items-center gap-2 px-1">
                  <ConfidenceBadge score={msg.confidence} isGrounded={msg.is_grounded ?? false} />
                  {msg.citations && msg.citations.length > 0 && (
                    <button
                      onClick={() => toggleCitations(msg.id)}
                      className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
                    >
                      {expandedCitations.has(msg.id) ? '▲ Hide' : '▼ Show'} {msg.citations.length} source{msg.citations.length !== 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              )}

              {/* Citations */}
              {msg.role === 'assistant' && expandedCitations.has(msg.id) && msg.citations && msg.citations.length > 0 && (
                <div className="space-y-2 w-full mt-1">
                  {msg.citations.map((cit, i) => (
                    <CitationCard key={i} citation={cit} index={i + 1} />
                  ))}
                </div>
              )}
            </div>

            {/* User avatar */}
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs font-bold shrink-0 mt-1">
                U
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 transition-colors">
        <div className="flex gap-2 items-end max-w-3xl mx-auto">
          <textarea
            className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-700
              bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
              placeholder:text-gray-400 dark:placeholder:text-gray-500
              px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              min-h-[48px] max-h-[160px] transition-colors"
            placeholder="Message DocuMind…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={() => {
              setMindmapQuery(input.trim() || 'main topics');
              setShowMindmap(true);
            }}
            disabled={isLoading || !input.trim()}
            className="shrink-0 w-11 h-11 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors
              flex items-center justify-center text-white"
            title="Generate mind map"
          >
            <div className="w-5 h-5"><BrainIcon /></div>
          </button>
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="shrink-0 w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors
              flex items-center justify-center text-white"
          >
            {isLoading ? (
              <div className="w-4 h-4 animate-spin"><SendIcon /></div>
            ) : (
              <div className="w-4 h-4 rotate-90"><SendIcon /></div>
            )}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-2 text-center">
          Enter to send · Shift+Enter for newline · 🧠 for mind map · Answers grounded in your documents
        </p>
      </div>

      {/* Mindmap modal */}
      {showMindmap && (
        <MindmapView
          namespace={namespace}
          query={mindmapQuery}
          selectedDocIds={filterDocIds}
          onClose={() => setShowMindmap(false)}
        />
      )}
    </div>
  );
}
