'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ChatWindow from '@/components/ChatWindow';
import UploadDropzone from '@/components/UploadDropzone';
import { DocumentRecord } from '@/types';
import { useTheme } from '@/context/ThemeContext';
import FlashcardView from '@/components/FlashcardView';

const NAMESPACE = 'demo-user';

export default function Home() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [showApp, setShowApp] = useState(false);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showFlashcards, setShowFlashcards] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      const resp = await fetch(`/api/documents?namespace=${NAMESPACE}`);
      if (resp.ok) setDocuments(await resp.json());
    } catch (e) {
      console.error('Failed to load documents:', e);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleUploadComplete = useCallback((doc: DocumentRecord) => {
    setDocuments((prev) => [doc, ...prev]);
  }, []);

  const handleDeleteDocument = useCallback(async (doc: DocumentRecord) => {
    if (!confirm(`Delete "${doc.filename}"?`)) return;
    try {
      await fetch(
        `/api/documents?id=${doc.id}&namespace=${NAMESPACE}&storage_path=${encodeURIComponent((doc as any).storage_path || '')}`,
        { method: 'DELETE' },
      );
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setSelectedDocIds((prev) => { const n = new Set(prev); n.delete(doc.id); return n; });
    } catch (e) { console.error('Delete failed:', e); }
  }, []);

  const toggleDocSelection = useCallback((id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const completedDocs = documents.filter((d) => d.status === 'complete');

  // Landing page
  if (!showApp) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950 font-sans transition-colors duration-200">
        {/* Navigation */}
        <nav className="fixed top-0 w-full z-50 backdrop-blur-sm bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📑</span>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                DocuMind
              </span>
            </div>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            {/* Main heading */}
            <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 dark:text-white mb-6 leading-tight">
              Your AI-Powered
              <span className="block bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Document Assistant
              </span>
            </h1>

            {/* Subheading */}
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed">
              Upload your documents and get instant answers powered by advanced RAG technology. 
              Ask questions, generate flashcards, and extract insights from your files effortlessly.
            </p>

            {/* Features grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
              <div className="p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-2">🚀</div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Lightning Fast</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Get answers in seconds</p>
              </div>
              <div className="p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-2">🎯</div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Accurate</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Powered by advanced AI</p>
              </div>
              <div className="p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-2">📚</div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Smart Learning</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Generate flashcards</p>
              </div>
            </div>

            {/* CTA Button */}
            <button
              onClick={() => setShowApp(true)}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg hover:shadow-xl hover:scale-105 transition-all duration-200 text-lg"
            >
              Get Started
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>

        {/* How it works section */}
        <div className="py-20 px-4 sm:px-6 lg:px-8 bg-white/50 dark:bg-gray-800/30">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4 text-xl font-bold text-blue-600 dark:text-blue-400">
                  1
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Upload Documents</h3>
                <p className="text-gray-600 dark:text-gray-400">Drag and drop your PDFs, Word docs, or text files</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mx-auto mb-4 text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  2
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Ask Questions</h3>
                <p className="text-gray-600 dark:text-gray-400">Get instant answers with citations from your docs</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto mb-4 text-xl font-bold text-purple-600 dark:text-purple-400">
                  3
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Learn & Export</h3>
                <p className="text-gray-600 dark:text-gray-400">Generate flashcards and study materials</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="py-8 px-4 text-center text-gray-600 dark:text-gray-400 text-sm">
          <p>Powered by Gemini embeddings · Groq LLM · Pinecone</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 font-sans transition-colors duration-200">

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'} shrink-0 flex flex-col
        bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
        transition-all duration-300`}>

        {/* Sidebar header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
          <span className="text-xl">📑</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-gray-900 dark:text-white truncate">DocuMind</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">RAG-powered Q&A</p>
          </div>
          <button
            onClick={() => setShowApp(false)}
            className="p-1 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xs"
            title="Back to home"
          >
            ← Home
          </button>
        </div>

        {/* Upload */}
        <div className="p-3 border-b border-gray-100 dark:border-gray-800">
          <UploadDropzone namespace={NAMESPACE} onUploadComplete={handleUploadComplete} />
        </div>

        {/* Doc list */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Documents
            </span>
            {completedDocs.length > 0 && (
              <button
                onClick={() => setSelectedDocIds(
                  selectedDocIds.size === completedDocs.length
                    ? new Set()
                    : new Set(completedDocs.map((d) => d.id))
                )}
                className="text-xs text-blue-500 hover:text-blue-400"
              >
                {selectedDocIds.size === completedDocs.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {completedDocs.length > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              {selectedDocIds.size === 0
                ? 'Searching all docs'
                : `${selectedDocIds.size} doc${selectedDocIds.size !== 1 ? 's' : ''} selected`}
            </p>
          )}

          {loadingDocs ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 text-center">Loading…</p>
          ) : documents.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 text-center">No documents yet</p>
          ) : (
            <ul className="space-y-1">
              {documents.map((doc) => {
                const isComplete = doc.status === 'complete';
                const isSelected = selectedDocIds.has(doc.id);
                return (
                  <li
                    key={doc.id}
                    onClick={() => isComplete && toggleDocSelection(doc.id)}
                    className={`flex items-center gap-2 px-2 py-2 rounded-lg border text-sm group transition-all
                      ${isComplete ? 'cursor-pointer' : 'cursor-default opacity-60'}
                      ${isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700'
                        : 'bg-transparent border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                  >
                    {/* Checkbox */}
                    <div className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors
                      ${isComplete && isSelected
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-gray-300 dark:border-gray-600'
                      }`}>
                      {isSelected && <span className="text-white text-[9px] font-bold">✓</span>}
                    </div>

                    <span className="shrink-0">
                      {doc.mime_type === 'application/pdf' ? '📕' : doc.mime_type?.includes('word') ? '📘' : '📄'}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{doc.filename}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        {doc.status === 'complete' && doc.chunks_created > 0 ? `${doc.chunks_created} chunks` : ''}
                        {doc.status === 'failed' && <span className="text-red-400">Failed</span>}
                        {doc.status === 'processing' && <span className="text-yellow-400">Processing…</span>}
                        {doc.status === 'pending' && <span className="text-yellow-400">Pending…</span>}
                      </p>
                    </div>

                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteDocument(doc); }}
                      className="shrink-0 text-gray-300 dark:text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                    >✕</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 dark:text-gray-600 text-center">
          Gemini embeddings · Groq LLM · Pinecone
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top navbar */}
        <header className="h-12 shrink-0 flex items-center justify-between px-4
          bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Toggle sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-800 dark:text-white">DocuMind</span>
          </div>

          {/* Dark mode toggle */}
          <div className="flex items-center gap-1">
            {completedDocs.length > 0 && (
              <button
                onClick={() => setShowFlashcards(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30
                  text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                title="Generate flashcards"
              >
                🃏 Flashcards
              </button>
            )}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* Chat */}
        <main className="flex-1 overflow-hidden">
          <ChatWindow
            namespace={NAMESPACE}
            filterDocIds={selectedDocIds.size > 0 ? Array.from(selectedDocIds) : undefined}
          />
        </main>
      </div>

      {/* Flashcard modal */}
      {showFlashcards && (
        <FlashcardView
          namespace={NAMESPACE}
          selectedDocIds={selectedDocIds.size > 0 ? Array.from(selectedDocIds) : undefined}
          onClose={() => setShowFlashcards(false)}
        />
      )}
    </div>
  );
}
