#!/usr/bin/env python3
"""Idempotent, structure-aware document ingestion into Qdrant."""
from __future__ import annotations

import csv
import fnmatch
import hashlib
import json
import os
import sys
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator

import httpx
import typer
from tqdm import tqdm

app = typer.Typer(no_args_is_help=True, add_completion=False)
SUPPORTED = {".pdf", ".docx", ".pptx", ".xlsx", ".html", ".htm", ".md", ".txt", ".doc", ".ppt", ".xls", ".odt", ".ods", ".odp", ".png", ".jpg", ".jpeg", ".tiff"}

class IngestError(RuntimeError):
    def __init__(self, code: str, message: str, cause: Exception | None = None):
        super().__init__(f"{code}: {message}"); self.code, self.cause = code, cause

@dataclass
class Chunk:
    content: str; embedding_text: str; document_id: str; document_title: str
    source_path: str; document_type: str; chunk_id: str; chunk_index: int
    content_sha256: str; document_version: str; page: int | None = None
    section: str | None = None; headings: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

@dataclass
class Report:
    knowledge_base: str; collection: str; started_at: str
    files_discovered: int = 0; files_processed: int = 0; files_skipped_unchanged: int = 0
    files_failed: int = 0; chunks_created: int = 0; vectors_inserted: int = 0
    embedding_model: str = ""; embedding_dimension: int | None = None; distance: str = "cosine"
    errors: list[dict[str, str]] = field(default_factory=list); duration_seconds: float = 0

def sha256_bytes(value: bytes) -> str: return hashlib.sha256(value).hexdigest()
def source_id(relative_path: str) -> str: return sha256_bytes(relative_path.replace("\\", "/").lower().encode())
def point_id(chunk_hash: str) -> str: return str(uuid.UUID(chunk_hash[:32]))
def chunk_identifier(src_id: str, version: str, index: int, content_hash: str) -> str:
    return sha256_bytes(f"{src_id}:{version}:{index}:{content_hash}".encode())

def discover_files(path: Path, recursive: bool, includes: list[str], excludes: list[str], include_hidden: bool = False) -> list[Path]:
    if path.is_file(): candidates = [path]
    elif path.is_dir(): candidates = list(path.rglob("*") if recursive else path.glob("*"))
    else: raise IngestError("INGEST_FILE_UNSUPPORTED", f"chemin introuvable: {path}")
    result = []
    for item in candidates:
        if not item.is_file() or item.name.startswith("~$"): continue
        rel_parts = item.relative_to(path if path.is_dir() else path.parent).parts
        if not include_hidden and any(part.startswith(".") for part in rel_parts): continue
        rel = "/".join(rel_parts)
        if item.suffix.lower() not in SUPPORTED: continue
        if includes and not any(fnmatch.fnmatch(rel, p) or fnmatch.fnmatch(item.name, p) for p in includes): continue
        if any(fnmatch.fnmatch(rel, p) or fnmatch.fnmatch(item.name, p) for p in excludes): continue
        result.append(item)
    return sorted(result)

def load_metadata(root: Path) -> dict[str, dict[str, Any]]:
    base = root if root.is_dir() else root.parent; result: dict[str, dict[str, Any]] = {}
    csv_path, json_path = base / "metadata.csv", base / "metadata.json"
    try:
        if csv_path.exists():
            with csv_path.open(encoding="utf-8-sig", newline="") as stream:
                for row in csv.DictReader(stream):
                    key = (row.pop("source_path", None) or "").replace("\\", "/")
                    if key: result[key] = {k: coerce(v) for k, v in row.items() if v != ""}
        if json_path.exists():
            data = json.loads(json_path.read_text(encoding="utf-8"))
            rows = data if isinstance(data, list) else [{"source_path": k, **v} for k, v in data.items()]
            for row in rows:
                key = str(row.get("source_path", "")).replace("\\", "/")
                if key: result[key] = {k: v for k, v in row.items() if k != "source_path"}
    except Exception as exc: raise IngestError("INGEST_METADATA_ERROR", "métadonnées externes invalides", exc) from exc
    return result

def coerce(value: str) -> Any:
    if value.lower() in {"true", "false"}: return value.lower() == "true"
    try: return int(value)
    except ValueError:
        try: return float(value)
        except ValueError: return value

def extract_chunks(path: Path, relative: str, cfg: dict[str, Any], metadata: dict[str, Any]) -> list[Chunk]:
    try:
        from docling.document_converter import DocumentConverter
        from docling.chunking import HybridChunker
        from transformers import AutoTokenizer
        conversion = DocumentConverter().convert(path)
        chunk_cfg = cfg.get("chunking", {}); max_tokens = int(chunk_cfg.get("maxTokens", 700))
        tokenizer_name = chunk_cfg.get("tokenizer", "Qwen/Qwen3-Embedding-0.6B")
        tokenizer = AutoTokenizer.from_pretrained(tokenizer_name)
        chunker = HybridChunker(tokenizer=tokenizer, max_tokens=max_tokens, merge_peers=True)
        raw_chunks = list(chunker.chunk(dl_doc=conversion.document))
    except Exception as exc: raise IngestError("INGEST_PARSE_ERROR", f"échec Docling: {path}", exc) from exc
    file_bytes = path.read_bytes(); version = sha256_bytes(file_bytes); src = source_id(relative)
    title = getattr(conversion.document, "name", None) or path.stem; include = cfg.get("embeddingText", {})
    chunks: list[Chunk] = []
    for index, raw in enumerate(raw_chunks):
        content = str(getattr(raw, "text", "")).strip()
        if not content: continue
        meta = getattr(raw, "meta", None); headings = list(getattr(meta, "headings", None) or [])
        page_numbers = []
        for item in getattr(meta, "doc_items", None) or []:
            for prov in getattr(item, "prov", None) or []:
                if getattr(prov, "page_no", None) is not None: page_numbers.append(int(prov.page_no))
        prefix = []
        if include.get("includeTitle", True): prefix.append(f"Document: {title}")
        if include.get("includeHeadings", True) and headings: prefix.append("Section: " + " > ".join(headings))
        embedded = "\n".join(prefix + ([""] if prefix else []) + [content]); content_hash = sha256_bytes(content.encode())
        cid = chunk_identifier(src, version, index, content_hash)
        chunks.append(Chunk(content, embedded, src, title, relative, path.suffix.lstrip(".").lower(), cid, index, content_hash, version, min(page_numbers) if page_numbers else None, headings[-1] if headings else None, headings, metadata))
    return chunks

class EmbeddingClient:
    def __init__(self, cfg: dict[str, Any]):
        self.cfg = cfg; self.model = cfg["model"]; self.timeout = cfg.get("timeoutSeconds", 60); self.retries = cfg.get("maxRetries", 3)
    def embed(self, texts: list[str]) -> list[list[float]]:
        url = self.cfg["baseUrl"].rstrip("/") + ("/embeddings" if self.cfg["type"] == "openai-compatible" else "/api/embed")
        headers = {}; env = self.cfg.get("apiKeyEnv")
        if env:
            secret = os.getenv(env)
            if not secret: raise IngestError("INGEST_EMBEDDING_ERROR", f"variable d'environnement absente: {env}")
            headers["Authorization"] = f"Bearer {secret}"
        body = {"model": self.model, "input": texts} if self.cfg["type"] == "openai-compatible" else {"model": self.model, "input": texts}
        for attempt in range(self.retries + 1):
            try:
                response = httpx.post(url, headers=headers, json=body, timeout=self.timeout); response.raise_for_status(); data = response.json()
                vectors = [x["embedding"] for x in data["data"]] if "data" in data else data["embeddings"]
                if len(vectors) != len(texts) or any(not vector for vector in vectors): raise ValueError("réponse embedding invalide")
                return vectors
            except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as exc:
                transient = not isinstance(exc, httpx.HTTPStatusError) or exc.response.status_code in {408, 429, 500, 502, 503, 504}
                if attempt >= self.retries or not transient: raise IngestError("INGEST_EMBEDDING_ERROR", f"échec embeddings ({self.model})", exc) from exc
                time.sleep(min(2 ** attempt, 8))
        raise AssertionError("unreachable")

def qdrant_client(cfg: dict[str, Any]):
    from qdrant_client import QdrantClient
    env = cfg.get("apiKeyEnv"); key = os.getenv(env) if env else None
    if env and not key: raise IngestError("INGEST_COLLECTION_INCOMPATIBLE", f"variable d'environnement absente: {env}")
    return QdrantClient(url=cfg["url"], api_key=key)

def ensure_collection(client: Any, kb: dict[str, Any], dimension: int, recreate: bool, yes: bool) -> None:
    from qdrant_client.models import Distance, VectorParams
    collection, vector_name = kb["collection"], kb.get("vectorName"); distance_name = kb.get("ingestion", {}).get("distance", "cosine").upper()
    distance = getattr(Distance, distance_name)
    exists = client.collection_exists(collection)
    if exists and recreate:
        if not yes and not typer.confirm(f"ATTENTION: supprimer et recréer la collection {collection} ?"): raise typer.Abort()
        client.delete_collection(collection); exists = False
    vectors = {vector_name: VectorParams(size=dimension, distance=distance)} if vector_name else VectorParams(size=dimension, distance=distance)
    if not exists: client.create_collection(collection, vectors_config=vectors); return
    info = client.get_collection(collection); current = info.config.params.vectors
    current = current.get(vector_name) if vector_name and isinstance(current, dict) else current
    if current is None: raise IngestError("INGEST_COLLECTION_INCOMPATIBLE", f"named vector absent: {vector_name}")
    if current.size != dimension or str(current.distance).split(".")[-1].lower() != distance_name.lower():
        raise IngestError("INGEST_COLLECTION_INCOMPATIBLE", f"collection incompatible: dimension/distance attendue {dimension}/{distance_name}")

def existing_versions(client: Any, collection: str, src: str) -> set[str]:
    from qdrant_client.models import FieldCondition, Filter, MatchValue
    points, _ = client.scroll(collection, scroll_filter=Filter(must=[FieldCondition(key="document_id", match=MatchValue(value=src))]), limit=256, with_payload=["document_version"])
    return {str(p.payload.get("document_version")) for p in points if p.payload}

def delete_source(client: Any, collection: str, src: str) -> None:
    from qdrant_client.models import FieldCondition, Filter, FilterSelector, MatchValue
    client.delete(collection, points_selector=FilterSelector(filter=Filter(must=[FieldCondition(key="document_id", match=MatchValue(value=src))])), wait=True)

def upsert_chunks(client: Any, kb: dict[str, Any], chunks: list[Chunk], vectors: list[list[float]]) -> None:
    from qdrant_client.models import PointStruct
    now = datetime.now(timezone.utc).isoformat(); vector_name = kb.get("vectorName")
    points = []
    for chunk, vector in zip(chunks, vectors):
        payload = {"content": chunk.content, "document_id": chunk.document_id, "corpus_id": kb["collection"] + ":" + str(kb.get("vectorName", "")), "document_title": chunk.document_title, "source_path": chunk.source_path, "document_type": chunk.document_type, "chunk_id": chunk.chunk_id, "chunk_index": chunk.chunk_index, "content_sha256": chunk.content_sha256, "document_version": chunk.document_version, "ingested_at": now, **chunk.metadata}
        for key in ("page", "section", "headings"):
            value = getattr(chunk, key)
            if value not in (None, [], ""): payload[key] = value
        points.append(PointStruct(id=point_id(chunk.chunk_id), vector={vector_name: vector} if vector_name else vector, payload=payload))
    client.upsert(kb["collection"], points=points, wait=True)

def create_payload_indexes(client: Any, kb: dict[str, Any]) -> None:
    from qdrant_client.models import PayloadSchemaType
    explicit = kb.get("ingestion", {}).get("filterFields", {})
    for field_name in kb.get("filterableFields", []):
        type_name = explicit.get(field_name, "integer" if field_name in {"year", "page", "chunk_index"} else "keyword").upper()
        client.create_payload_index(kb["collection"], field_name=field_name, field_schema=getattr(PayloadSchemaType, type_name), wait=True)

def write_report(report: Report, config_path: Path) -> Path:
    directory = config_path.parent.parent / ".ingestion"; directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S"); path = directory / f"{report.knowledge_base}-{stamp}.json"
    path.write_text(json.dumps(asdict(report), indent=2, ensure_ascii=False), encoding="utf-8"); return path

@app.command()
def ingest(
    config: Path = typer.Option(Path(".pi/rag.json"), exists=True, readable=True), knowledge_base: str = typer.Option(..., "--knowledge-base"),
    input_path: Path | None = typer.Option(None, "--input"), include: list[str] = typer.Option([], "--include"), exclude: list[str] = typer.Option([], "--exclude"),
    batch_size: int | None = typer.Option(None, "--batch-size", min=1), dry_run: bool = typer.Option(False, "--dry-run"), fail_fast: bool = typer.Option(False, "--fail-fast"),
    recreate: bool = typer.Option(False, "--recreate"), sync: bool = typer.Option(False, "--sync"), force: bool = typer.Option(False, "--force"),
    verbose: bool = typer.Option(False, "--verbose"), include_hidden: bool = typer.Option(False, "--include-hidden"), yes: bool = typer.Option(False, "--yes")
) -> None:
    started = time.monotonic(); raw = json.loads(config.read_text(encoding="utf-8"))
    if raw.get("version") != 1 or knowledge_base not in raw.get("knowledgeBases", {}): raise typer.BadParameter("configuration ou knowledge base invalide")
    kb = raw["knowledgeBases"][knowledge_base]; ingest_cfg = kb.get("ingestion", {}); root = (input_path or Path(ingest_cfg.get("inputDirectory", "."))).resolve()
    recursive = bool(ingest_cfg.get("recursive", True)); files = discover_files(root, recursive, include, exclude, include_hidden)
    report = Report(knowledge_base, kb["collection"], datetime.now(timezone.utc).isoformat(), files_discovered=len(files), embedding_model=raw["embeddingProviders"][kb["embeddingProvider"]]["model"], distance=ingest_cfg.get("distance", "cosine"))
    external = load_metadata(root)
    provider_cfg = {**raw["embeddingProviders"][kb["embeddingProvider"]], **{k: ingest_cfg[k] for k in ("timeoutSeconds", "maxRetries") if k in ingest_cfg}}
    embedding = EmbeddingClient(provider_cfg); size = batch_size or int(ingest_cfg.get("batchSize", 32)); client = None; known_sources: set[str] = set()
    try:
        for path in tqdm(files, desc="Documents"):
            relative = path.relative_to(root if root.is_dir() else root.parent).as_posix(); src = source_id(relative); known_sources.add(src)
            try:
                version = sha256_bytes(path.read_bytes())
                if not dry_run:
                    client = client or qdrant_client(raw["vectorStores"][kb["vectorStore"]])
                    if not force and client.collection_exists(kb["collection"]) and version in existing_versions(client, kb["collection"], src): report.files_skipped_unchanged += 1; continue
                chunks = extract_chunks(path, relative, ingest_cfg, external.get(relative, {})); report.chunks_created += len(chunks)
                if dry_run: report.files_processed += 1; continue
                vectors: list[list[float]] = []
                for offset in range(0, len(chunks), size): vectors.extend(embedding.embed([c.embedding_text for c in chunks[offset:offset + size]]))
                if not vectors: raise IngestError("INGEST_CHUNK_ERROR", "aucun chunk produit")
                dimension = len(vectors[0]); report.embedding_dimension = report.embedding_dimension or dimension
                if any(len(v) != dimension for v in vectors): raise IngestError("INGEST_EMBEDDING_ERROR", "dimensions hétérogènes")
                ensure_collection(client, kb, dimension, recreate and report.files_processed == 0, yes)
                old = existing_versions(client, kb["collection"], src)
                upsert_chunks(client, kb, chunks, vectors)
                if old and old != {version}: delete_source_versions(client, kb["collection"], src, version)
                report.files_processed += 1; report.vectors_inserted += len(vectors)
            except Exception as exc:
                report.files_failed += 1; report.errors.append({"file": relative, "error": str(exc)})
                if verbose: typer.echo(f"ERROR {relative}: {exc}", err=True)
                if fail_fast: raise
        if client and report.embedding_dimension: create_payload_indexes(client, kb)
        if sync and client: sync_missing(client, kb["collection"], known_sources)
    finally:
        report.duration_seconds = round(time.monotonic() - started, 3); report_path = write_report(report, config)
        typer.echo(f"Knowledge base: {knowledge_base}\nCollection: {kb['collection']}\n\nFiles discovered: {report.files_discovered}\nFiles processed: {report.files_processed}\nFiles skipped unchanged: {report.files_skipped_unchanged}\nFiles failed: {report.files_failed}\n\nChunks created: {report.chunks_created}\nVectors inserted: {report.vectors_inserted}\n\nEmbedding model: {report.embedding_model}\nEmbedding dimension: {report.embedding_dimension or 'n/a'}\nDistance: {report.distance}\n\nDuration: {report.duration_seconds}s\nReport: {report_path}")

def delete_source_versions(client: Any, collection: str, src: str, keep_version: str) -> None:
    from qdrant_client.models import FieldCondition, Filter, FilterSelector, MatchValue
    filt = Filter(must=[FieldCondition(key="document_id", match=MatchValue(value=src))], must_not=[FieldCondition(key="document_version", match=MatchValue(value=keep_version))])
    client.delete(collection, points_selector=FilterSelector(filter=filt), wait=True)

def sync_missing(client: Any, collection: str, known: set[str]) -> None:
    offset = None; found: set[str] = set()
    while True:
        points, offset = client.scroll(collection, offset=offset, limit=256, with_payload=["document_id"])
        found.update(str(p.payload["document_id"]) for p in points if p.payload and "document_id" in p.payload)
        if offset is None: break
    for src in found - known: delete_source(client, collection, src)

if __name__ == "__main__": app()
