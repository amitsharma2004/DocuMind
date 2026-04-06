'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { DocumentRecord, IngestionStatus } from '@/types';

interface UploadDropzoneProps {
  namespace: string;
  onUploadComplete: (doc: DocumentRecord) => void;
}

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
};

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

interface UploadTask {
  filename: string;
  state: UploadState;
  error?: string;
  chunks?: number;
}

export default function UploadDropzone({ namespace, onUploadComplete }: UploadDropzoneProps) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);

  const uploadFile = useCallback(async (file: File) => {
    const taskId = file.name + Date.now();
    const newTask: UploadTask = { filename: file.name, state: 'uploading' };

    setTasks((prev) => [...prev, newTask]);

    const form = new FormData();
    form.append('file', file);
    form.append('namespace', namespace);

    try {
      const resp = await fetch('/api/upload', { method: 'POST', body: form });
      const json: IngestionStatus | { error: string } = await resp.json();

      if (!resp.ok || 'error' in json) {
        const errMsg = ('error' in json ? json.error : null) || 'Upload failed.';
        setTasks((prev) =>
          prev.map((t) => (t.filename === file.name ? { ...t, state: 'error', error: errMsg } : t)),
        );
        return;
      }

      const status = json as IngestionStatus;
      setTasks((prev) =>
        prev.map((t) =>
          t.filename === file.name ? { ...t, state: 'success', chunks: status.chunks_created } : t,
        ),
      );

      // Notify parent to refresh document list
      onUploadComplete({
        id: status.doc_id,
        filename: file.name,
        file_size: file.size,
        mime_type: file.type,
        status: status.status,
        chunks_created: status.chunks_created,
        created_at: new Date().toISOString(),
      });
    } catch (e: any) {
      setTasks((prev) =>
        prev.map((t) =>
          t.filename === file.name ? { ...t, state: 'error', error: e.message } : t,
        ),
      );
    }
  }, [namespace, onUploadComplete]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      acceptedFiles.forEach(uploadFile);
    },
    [uploadFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 50 * 1024 * 1024,
    multiple: true,
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400 bg-slate-50'}`}
      >
        <input {...getInputProps()} />
        <div className="text-3xl mb-2">📂</div>
        {isDragActive ? (
          <p className="text-blue-600 font-medium">Drop files here…</p>
        ) : (
          <>
            <p className="text-slate-700 font-medium">Drop documents here, or click to browse</p>
            <p className="text-slate-400 text-sm mt-1">PDF, DOCX, TXT — up to 50 MB each</p>
          </>
        )}
      </div>

      {tasks.length > 0 && (
        <div className="space-y-2">
          {tasks.map((task, i) => (
            <div key={i} className="flex items-center gap-3 text-sm p-2 rounded-lg border border-slate-100 bg-white">
              <span className="shrink-0 text-lg">
                {task.state === 'uploading' ? '⏳' : task.state === 'success' ? '✅' : '❌'}
              </span>
              <span className="flex-1 truncate text-slate-700">{task.filename}</span>
              {task.state === 'uploading' && (
                <span className="text-slate-400 text-xs">Processing…</span>
              )}
              {task.state === 'success' && (
                <span className="text-green-600 text-xs">{task.chunks} chunks</span>
              )}
              {task.state === 'error' && (
                <span className="text-red-500 text-xs truncate max-w-xs" title={task.error}>
                  {task.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
