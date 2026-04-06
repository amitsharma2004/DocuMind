"""Centralised settings loaded from environment variables."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Google Gemini ---
    google_api_key: str = ""

    # --- OpenAI (LLM only) ---
    openai_api_key: str = ""

    # --- Pinecone ---
    pinecone_api_key: str = ""
    pinecone_environment: str = ""
    pinecone_index_name: str = "doc-intelligence"

    # --- Internal service auth ---
    internal_api_key: str = "dev-secret"  # Override in production

    # --- Vector store mode ---
    vector_store: str = "pinecone"  # "pinecone" | "chroma"
    chroma_persist_dir: str = "./chroma_data"

    # --- RAG tuning ---
    confidence_threshold: float = 0.75
    chunk_size: int = 512
    chunk_overlap: int = 64
    top_k: int = 5
    chat_history_window: int = 4  # Number of turns (not messages)

    # --- LLM ---
    # Model name — supports any OpenAI-compatible provider (OpenAI, Groq, etc.)
    openai_model: str = "openai/gpt-oss-20b"
    # Optional base URL override — set to Groq endpoint when using Groq API keys (gsk_*)
    # e.g. https://api.groq.com/openai/v1
    openai_base_url: str = "https://api.groq.com/openai/v1"
    llm_timeout_seconds: int = 30


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
