import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_URL = process.env.FASTAPI_URL ?? 'http://localhost:8000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? '';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const resp = await fetch(`${FASTAPI_URL}/mindmap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-API-Key': INTERNAL_API_KEY },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}
