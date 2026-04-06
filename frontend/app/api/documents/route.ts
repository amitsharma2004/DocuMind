/**
 * GET  /api/documents?namespace=xxx — list documents for a namespace
 * DELETE /api/documents?id=xxx&namespace=xxx — delete a document
 */
import { NextRequest, NextResponse } from 'next/server';
import { listDocuments, deleteDocument } from '@/lib/db/client';
import { deleteFile } from '@/lib/storage/supabase';

const FASTAPI_URL = process.env.FASTAPI_URL ?? 'http://localhost:8000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? '';

export async function GET(req: NextRequest) {
  const namespace = req.nextUrl.searchParams.get('namespace') || 'default';
  try {
    const docs = await listDocuments(namespace);
    return NextResponse.json(docs);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const namespace = req.nextUrl.searchParams.get('namespace') || 'default';
  const storagePath = req.nextUrl.searchParams.get('storage_path') || '';

  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  // 1. Delete vectors from FastAPI / vector store
  try {
    await fetch(`${FASTAPI_URL}/documents/${id}?namespace=${namespace}`, {
      method: 'DELETE',
      headers: { 'X-Internal-API-Key': INTERNAL_API_KEY },
    });
  } catch (e) {
    console.warn('[documents] FastAPI delete failed (non-fatal):', e);
  }

  // 2. Delete from Supabase Storage
  if (storagePath) {
    try {
      await deleteFile(storagePath);
    } catch (e) {
      console.warn('[documents] Storage delete failed (non-fatal):', e);
    }
  }

  // 3. Delete Postgres record
  try {
    await deleteDocument(id);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
