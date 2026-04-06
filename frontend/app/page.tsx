'use client';

import { useState, useEffect, useCallback } from 'react';
import ChatWindow from '@/components/ChatWindow';
import UploadDropzone from '@/components/UploadDropzone';
import { DocumentRecord } from '@/types';

// Namespace scoping — in production this would come from auth/session
const NAMESPACE = 'demo-user';

export default function Home() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  const fetchDocuments = useCallback(async () => {
    try {
      const resp = await fetch(`/api/documents?namespace=${NAMESPACE}`);
      if (resp.ok) {
        const data = await resp.json();
        setDocuments(data);
      }
    } catch (e) {
      console.error('Failed to load documents:', e);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleUploadComplete = useCallback((doc: DocumentRecord) => {
    setDocuments((prev) => [doc, ...prev]);
  }, []);

  const handleDeleteDocument = useCallback(async (doc: DocumentRecord) => {
    if (!confirm(`Delete "${doc.filename}"? This cannot be undone.`)) return;
    try {
      await fetch(
        `/api/documents?id=${doc.id}&namespace=${NAMESPACE}&storage_path=${encodeURIComponent((doc as any).storage_path || '')}`,
        { method: 'DELETE' },
      );
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (e) {
      console.error('Delete failed:', e);
    }
  }, []);

  return (
    <div className="flex h-screen bg-slate-100 font-sans">
      {/* Left panel — document management */}
      <aside className="w-80 shrink-0 flex flex-col bg-white border-r border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h1 className="text-base font-semibold text-slate-900">📑 Document Intelligence</h1>
          <p className="text-xs text-slate-500 mt-0.5">RAG-powered Q&A with source citations</p>
        </div>

        {/* Upload dropzone */}
        <div className="p-4 border-b border-slate-100">
          <UploadDropzone namespace={NAMESPACE} onUploadComplete={handleUploadComplete} />
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Uploaded Documents
          </h2>

          {loadingDocs ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-slate-400">No documents yet. Upload one to get started.</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 group"
                >
                  <span className="text-lg shrink-0">
                    {doc.mime_type === 'application/pdf' ? '📕' : doc.mime_type.includes('word') ? '📘' : '📄'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate" title={doc.filename}>
                      {doc.filename}
                    </p>
                    <p className="text-xs text-slate-400">
                      {doc.chunks_created > 0 ? `${doc.chunks_created} chunks` : ''}
                      {doc.status === 'failed' ? (
                        <span className="text-red-500 ml-1">Failed</span>
                      ) : doc.status !== 'complete' ? (
                        <span className="text-yellow-500 ml-1">Processing…</span>
                      ) : null}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteDocument(doc)}
                    className="shrink-0 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                    title="Delete document"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 text-xs text-slate-400 text-center">
          Gemini embeddings · GPT-4o · Pinecone
        </div>
      </aside>

      {/* Right panel — chat */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <ChatWindow namespace={NAMESPACE} />
      </main>
    </div>
  );
}
