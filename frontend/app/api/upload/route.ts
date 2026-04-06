/**
 * POST /api/upload
 *
 * Handles multi-format document upload:
 * 1. Validates file type and size
 * 2. Saves file to Supabase Storage
 * 3. Creates Postgres record
 * 4. Calls FastAPI POST /ingest
 * 5. Returns ingestion status to client
 */
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { uploadFile } from '@/lib/storage/supabase';
import { createDocument, updateDocumentStatus } from '@/lib/db/client';
import { IngestionStatus } from '@/types';

const FASTAPI_URL = process.env.FASTAPI_URL ?? 'http://localhost:8000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? '';

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(req: NextRequest) {
  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data.' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const namespace = (formData.get('namespace') as string) || 'default';

  if (!file) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }

  // Validate type
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Allowed: PDF, DOCX, TXT.` },
      { status: 400 },
    );
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 50 MB limit.' }, { status: 400 });
  }

  const docId = uuidv4();
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  // --- Upload to Supabase Storage ---
  let storagePath: string;
  try {
    storagePath = await uploadFile({
      fileBuffer,
      filename: file.name,
      mimeType: file.type,
      namespace,
      docId,
    });
  } catch (e: any) {
    console.error('[upload] Storage error:', e);
    return NextResponse.json({ error: 'File storage failed.' }, { status: 500 });
  }

  // --- Create Postgres record ---
  try {
    await createDocument({
      id: docId,
      namespace,
      filename: file.name,
      file_size: file.size,
      mime_type: file.type,
      storage_path: storagePath,
    });
  } catch (e: any) {
    console.error('[upload] DB create error:', e);
    return NextResponse.json({ error: 'Database record creation failed.' }, { status: 500 });
  }

  // --- Trigger FastAPI ingestion ---
  const ingestForm = new FormData();
  ingestForm.append('file', new Blob([fileBuffer], { type: file.type }), file.name);
  ingestForm.append('doc_id', docId);
  ingestForm.append('namespace', namespace);
  ingestForm.append('source_file', file.name);

  let ingestionResult: IngestionStatus;
  try {
    const resp = await fetch(`${FASTAPI_URL}/ingest`, {
      method: 'POST',
      headers: { 'X-Internal-API-Key': INTERNAL_API_KEY },
      body: ingestForm,
    });

    if (!resp.ok) {
      const detail = await resp.json().catch(() => ({}));
      const errorMsg = detail?.detail?.error || 'Ingestion failed.';
      await updateDocumentStatus(docId, 'failed', 0, errorMsg);
      return NextResponse.json({ error: errorMsg }, { status: resp.status });
    }

    ingestionResult = await resp.json();
    await updateDocumentStatus(docId, ingestionResult.status, ingestionResult.chunks_created);
  } catch (e: any) {
    console.error('[upload] FastAPI ingest error:', e);
    await updateDocumentStatus(docId, 'failed', 0, e.message);
    return NextResponse.json({ error: 'Ingestion service unreachable.' }, { status: 502 });
  }

  return NextResponse.json(ingestionResult, { status: 200 });
}
