# Business Document Intelligence System

A production-grade RAG (Retrieval-Augmented Generation) application. Upload contracts, policy manuals, or product specs — ask questions in plain English — get cited answers with exact page numbers. The core differentiator: a **pre-LLM confidence guard** that returns *"I don't know"* instead of hallucinating when no relevant content exists.

---

## Features

- **Multi-format upload** — PDF, DOCX, TXT (up to 50 MB each)
- **Page-accurate citations** — PDF answers cite page numbers; DOCX answers cite section headings
- **Confidence score display** — colour-coded badge (high / moderate / no match) on every response
- **Hallucination guard** — cosine similarity < 0.75 → skips LLM entirely, returns "I don't know"
- **Chat history** — full conversation persisted in Postgres; last 4 turns passed to LLM for context
- **Dual vector store** — Pinecone (production) or Chroma (local dev), swap via env var

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│  Next.js 14 (App Router)                                │
│  UploadDropzone │ ChatWindow │ CitationCard │ ConfBadge  │
└────────────┬────────────────────────┬───────────────────┘
             │ POST /api/upload        │ POST /api/query
             ▼                         ▼
┌─────────────────────────────────────────────────────────┐
│  Next.js API Routes (BFF — credentials never hit browser)│
│  /api/upload  /api/query  /api/documents                │
└──────┬─────────────────────────────┬────────────────────┘
       │ multipart/form-data          │ JSON
       ▼                              ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│  FastAPI Microservice │   │  FastAPI Microservice         │
│  POST /ingest         │   │  POST /query                  │
│  ┌─────────────────┐ │   │  ┌──────────────────────────┐ │
│  │ Parser (PyMuPDF)│ │   │  │ Retriever (Gemini embed) │ │
│  │ Chunker (512/64)│ │   │  │ Confidence Guard (0.75)  │ │
│  │ Embedder (Gemini│ │   │  │ GPT-oss-20b (Groq)       │ │
│  │ Pinecone upsert │ │   │  │ Citation Builder          │ │
│  └─────────────────┘ │   │  └──────────────────────────┘ │
└──────────────────────┘   └──────────────────────────────┘
       │                              │
       ▼                              ▼
┌─────────────┐             ┌─────────────────────┐
│  Pinecone   │             │  Supabase            │
│  768-dim    │             │  Postgres (docs +    │
│  vectors    │             │  chat history)       │
│  namespaced │             │  Storage (raw files) │
└─────────────┘             └─────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Backend API | FastAPI (Python 3.11), Uvicorn |
| Embeddings | Google Gemini `text-embedding-004` (768-dim) |
| LLM | `openai/gpt-oss-20b` via Groq API |
| Vector Store | Pinecone (prod) / Chroma (dev) |
| Database | Supabase (Postgres + Storage) |
| Container | Docker + Docker Compose |

---

## Prerequisites

- [Docker](https://www.docker.com/) & Docker Compose v2+
- [Pinecone](https://pinecone.io) account (free tier works for demo)
- [Supabase](https://supabase.com) project (free tier)
- [Google AI Studio](https://aistudio.google.com) API key (Gemini embeddings)
- [Groq](https://console.groq.com) API key (LLM)

---

## Quick Start

### 1. Clone / enter project

```bash
cd business-doc-intelligence
```

### 2. Set up Pinecone index

1. Go to [app.pinecone.io](https://app.pinecone.io) → **Create Index**
2. Name: `doc-intelligence`
3. Dimensions: **768** ← critical, cannot be changed later
4. Metric: `cosine`
5. Copy your **API Key** and **Environment**

### 3. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste and run `frontend/lib/db/schema.sql`
3. Go to **Storage** → create a bucket named `documents` (set to private)
4. Copy your **Project URL** and **Service Role Key** (Settings → API)

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your keys:

```env
# Google Gemini (embeddings)
GOOGLE_API_KEY=AIza...

# Groq (LLM — gpt-oss-20b)
OPENAI_API_KEY=gsk_...
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=openai/gpt-oss-20b

# Pinecone
PINECONE_API_KEY=pcsk_...
PINECONE_ENVIRONMENT=us-east-1-aws
PINECONE_INDEX_NAME=doc-intelligence

# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STORAGE_BUCKET=documents

# Internal service auth (any random string)
INTERNAL_API_KEY=my-random-secret-123

# Vector store: "pinecone" for prod, "chroma" for local dev
VECTOR_STORE=pinecone
```

### 5. Build and run

```bash
docker-compose up --build
```

> First build takes ~3–5 minutes (installs Python + Node deps).
> Subsequent starts are fast.

### 6. Open the app

```
http://localhost:3000
```

---

## Project Structure

```
business-doc-intelligence/
├── api/                            # FastAPI microservice (Python)
│   ├── main.py                     # App entry point, health check
│   ├── config.py                   # Settings from env vars
│   ├── models.py                   # Pydantic request/response models
│   ├── dependencies.py             # Internal API key auth
│   ├── routers/
│   │   ├── ingest.py               # POST /ingest
│   │   ├── query.py                # POST /query
│   │   └── documents.py            # DELETE /documents/{id}
│   ├── services/
│   │   ├── parser.py               # PDF (PyMuPDF), DOCX, TXT parsing
│   │   ├── chunker.py              # Recursive chunking with overlap
│   │   ├── embedder.py             # Gemini text-embedding-004 (async)
│   │   ├── retriever.py            # Vector store query
│   │   ├── guard.py                # Pre-LLM confidence threshold check
│   │   ├── prompt_builder.py       # System prompt + context assembly
│   │   └── citation_builder.py     # Maps chunks → Citation objects
│   ├── vectorstore/
│   │   ├── __init__.py             # Store router (pinecone | chroma)
│   │   ├── pinecone_client.py      # Pinecone upsert/query/delete
│   │   └── chroma_client.py        # Chroma upsert/query/delete (dev)
│   ├── Dockerfile
│   ├── .dockerignore
│   └── requirements.txt
│
├── frontend/                       # Next.js 14 App Router (TypeScript)
│   ├── app/
│   │   ├── page.tsx                # Main UI (split layout)
│   │   ├── layout.tsx              # Root layout
│   │   ├── globals.css
│   │   └── api/
│   │       ├── upload/route.ts     # File upload → storage → DB → FastAPI
│   │       ├── query/route.ts      # Chat query → history → FastAPI
│   │       └── documents/route.ts  # List + delete documents
│   ├── components/
│   │   ├── ChatWindow.tsx          # Chat UI with history + citations toggle
│   │   ├── UploadDropzone.tsx      # Drag-and-drop multi-file upload
│   │   ├── CitationCard.tsx        # Source excerpt card (file + page)
│   │   └── ConfidenceBadge.tsx     # Score badge (green/yellow/red)
│   ├── lib/
│   │   ├── db/
│   │   │   ├── client.ts           # Supabase DB operations
│   │   │   └── schema.sql          # Postgres table definitions
│   │   └── storage/
│   │       └── supabase.ts         # File upload/delete/signed URL
│   ├── types/index.ts              # Shared TypeScript interfaces
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── next.config.js
│   ├── tailwind.config.ts
│   └── package.json
│
├── docker-compose.yml
├── .env.example                    # Copy to .env and fill in keys
├── .gitignore
└── README.md
```

---

## How It Works

### Ingestion Pipeline
```
Upload → Parse (page boundaries) → Chunk (512 tokens / 64 overlap)
       → Embed (Gemini 768-dim) → Upsert to Pinecone (namespaced)
       → Save metadata to Postgres
```

### Query Pipeline
```
Question → Embed (Gemini retrieval_query) → Fetch top-5 from Pinecone
         → Confidence Guard (max score < 0.75 → "I don't know", no LLM call)
         → Build prompt (context + 4-turn history) → gpt-oss-20b
         → Return answer + confidence score + citations
```

### Citation Format
- **PDF**: `[Source: policy.pdf, Page 12]`
- **DOCX**: `[Source: manual.docx, Section: Coverage Exclusions]`
- **TXT**: `[Source: terms.txt]`

---

## Development (without Docker)

### FastAPI
```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env   # fill in keys
uvicorn api.main:app --reload --port 8000
```

API docs available at: `http://localhost:8000/docs`

### Next.js
```bash
cd frontend
npm install
# create .env.local with FASTAPI_URL=http://localhost:8000 and Supabase keys
npm run dev
```

---

## Configuration Reference

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_API_KEY` | — | Gemini API key (embeddings) |
| `OPENAI_API_KEY` | — | Groq API key (`gsk_*`) |
| `OPENAI_BASE_URL` | `https://api.groq.com/openai/v1` | LLM endpoint |
| `OPENAI_MODEL` | `openai/gpt-oss-20b` | LLM model name |
| `PINECONE_API_KEY` | — | Pinecone API key |
| `PINECONE_INDEX_NAME` | `doc-intelligence` | Must have dim=768 |
| `SUPABASE_URL` | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Server-side only key |
| `INTERNAL_API_KEY` | — | Shared secret between Next.js ↔ FastAPI |
| `VECTOR_STORE` | `pinecone` | `pinecone` or `chroma` |
| `CONFIDENCE_THRESHOLD` | `0.75` | Below this → "I don't know" |
| `CHUNK_SIZE` | `512` | Characters per chunk |
| `CHUNK_OVERLAP` | `64` | Overlap between chunks |
| `TOP_K` | `5` | Chunks retrieved per query |
| `CHAT_HISTORY_WINDOW` | `4` | Turns passed to LLM context |

---

## Demo Script

1. Upload `insurance_policy.pdf` via the dropzone
2. Ask: **"What's excluded from my coverage?"**
3. Expected: cited answer with page numbers + confidence score ≥ 0.75
4. Ask: **"What's the policy on Mars travel?"**
5. Expected: *"I don't know based on the provided documents."* — guard fired, no hallucination

---

## Constraints (Free Tier)

| Service | Limit |
|---|---|
| Pinecone free tier | 1 index, 100k vectors |
| Supabase free tier | 500 MB DB, 1 GB storage |
| Groq free tier | Rate limited (check console.groq.com) |

Sufficient for demo and portfolio use. Document these limits for clients.

---

## Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` is server-side only — never exposed to the browser
- `INTERNAL_API_KEY` prevents direct public access to FastAPI endpoints
- All file uploads flow through Next.js → FastAPI (credentials never in browser)
- Never commit `.env` to version control (`.gitignore` already covers this)
