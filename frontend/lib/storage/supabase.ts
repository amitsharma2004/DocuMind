/**
 * Supabase Storage wrapper — server-side file upload.
 * Files are stored under namespace/doc_id/filename.
 */
import { createClient } from '@supabase/supabase-js';

function getStorageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key).storage;
}

const BUCKET = process.env.STORAGE_BUCKET ?? 'documents';

/**
 * Upload a file buffer to Supabase Storage.
 *
 * @returns The storage path (used to reconstruct signed URLs later).
 */
export async function uploadFile(params: {
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
  namespace: string;
  docId: string;
}): Promise<string> {
  const { fileBuffer, filename, mimeType, namespace, docId } = params;
  const storagePath = `${namespace}/${docId}/${filename}`;

  const { error } = await getStorageClient()
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return storagePath;
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFile(storagePath: string): Promise<void> {
  const { error } = await getStorageClient().from(BUCKET).remove([storagePath]);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}

/**
 * Generate a short-lived signed URL for downloading a file.
 */
export async function getSignedUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await getStorageClient()
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) throw new Error(`Failed to generate signed URL: ${error?.message}`);
  return data.signedUrl;
}
