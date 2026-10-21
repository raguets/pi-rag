# pi-rag

`pi-rag` is a read-only Retrieval-Augmented Generation (RAG) extension for [Pi](https://pi.dev/).

It lets Pi search one or more configured knowledge bases, retrieve bounded passages from a vector database, and return those passages with source metadata so the agent can use them in grounded answers.

The repository also contains a separate Python ingestion CLI for parsing documents with Docling, creating embeddings, and loading vectors and metadata into Qdrant.

## What pi-rag does

At query time:

1. Pi calls `rag_search`.
2. `pi-rag` embeds the user query using the configured embedding provider.
3. The extension searches the configured vector store.
4. Matching chunks are returned with source metadata such as title, path, page, section, and business metadata.
5. Pi uses those retrieved passages as context for its answer.

At ingestion time, the Python CLI:

1. discovers supported documents;
2. parses them with Docling;
3. splits them into chunks;
4. creates embeddings through an OpenAI-compatible endpoint or Ollama;
5. creates or validates the Qdrant collection;
6. writes vectors and metadata to Qdrant;
7. records an ingestion report.

For Qdrant, the ingestion CLI and the Pi extension use the same `rag.json` configuration so that the embedding model, collection, vector name, payload mapping, and search settings remain consistent. The extension also reads pgvector and ChromaDB knowledge bases from this file, but the bundled Python CLI does not ingest into those backends.

---

## Current backend support

### Vector stores

The read-only Pi extension supports:

- Qdrant through its REST API;
- PostgreSQL with the pgvector extension through the PostgreSQL protocol;
- ChromaDB through its v2 HTTP API.

All three adapters share knowledge-base, embedding, payload mapping, filter allow-list, score threshold, and context-budget configuration. The Python ingestion CLI remains Qdrant-only by design; use your existing ingestion pipeline for pgvector or ChromaDB.

### Embedding providers

The extension currently supports:

- OpenAI-compatible embedding endpoints;
- Ollama.

This means the actual embedding model can be OpenAI, Jina, Qwen, BGE, or another model as long as the endpoint implements the expected API contract.

For an OpenAI-compatible provider, `pi-rag` sends:

```http
POST <baseUrl>/embeddings
Authorization: Bearer <token>
Content-Type: application/json
```

with a JSON body similar to:

```json
{
  "model": "your-embedding-model",
  "input": "text to embed"
}
```

The token is read from an environment variable referenced by `apiKeyEnv`.

---

## Requirements

### Extension

- Node.js `>=22.19.0`
- Pi
- a reachable Qdrant, PostgreSQL/pgvector, or ChromaDB instance
- an embedding endpoint compatible with OpenAI `/embeddings` or Ollama

### Ingestion CLI

- Python 3.11+
- the Python dependencies from `scripts/requirements-ingest.txt`
- Qdrant
- the same embedding provider used by the knowledge base

Docling can download model artifacts at first use. In restricted or offline enterprise environments, those artifacts may need to be preloaded in the local Hugging Face cache or otherwise made available offline.

---

# Installation

## Install from npm

The package is published as:

```text
@raguets/pi-rag
```

Install it in Pi with:

```bash
pi install npm:@raguets/pi-rag
```

To test it without permanently installing it:

```bash
pi -e npm:@raguets/pi-rag
```

## Install from GitHub

```bash
pi install git:github.com/raguets/pi-rag
```

A tagged version can be pinned explicitly:

```bash
pi install git:github.com/raguets/pi-rag@v1.0.0
```

## Local development installation

Clone the repository:

```bash
git clone https://github.com/raguets/pi-rag.git
cd pi-rag
```

Install and build the Node.js extension:

```bash
npm install
npm run build
```

Then install the local package in Pi.

### macOS / Linux

```bash
pi install .
```

### Windows PowerShell

```powershell
pi.cmd install .
```

If the PowerShell execution policy blocks `pi.ps1`, use `pi.cmd`.

After a local installation, Pi keeps the project path. When the TypeScript source changes, rebuild it:

```bash
npm run build
```

Then restart Pi. You normally do not need to run `pi install .` again.

---

# Python ingestion environment

## macOS / Linux

Create a virtual environment:

```bash
python3 -m venv .venv
```

Activate it:

```bash
source .venv/bin/activate
```

Install the ingestion dependencies:

```bash
python -m pip install --upgrade pip
python -m pip install -r scripts/requirements-ingest.txt
```

Deactivate later with:

```bash
deactivate
```

## Windows PowerShell

Create the environment:

```powershell
python -m venv .venv
```

Activate it:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
python -m pip install --upgrade pip
python -m pip install -r scripts/requirements-ingest.txt
```

If PowerShell activation is restricted, the Python executable can be called directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -r scripts/requirements-ingest.txt
```

---

# Qdrant quick start

A local Docker instance is convenient for development.

```bash
docker volume create qdrant-storage

docker run -d \
  --name qdrant \
  -p 127.0.0.1:6333:6333 \
  -p 127.0.0.1:6334:6334 \
  -v qdrant-storage:/qdrant/storage \
  qdrant/qdrant:latest
```

Once created, the container can be restarted with:

```bash
docker start qdrant
```

Check it:

```bash
curl http://localhost:6333
```

The local dashboard is usually available at:

```text
http://localhost:6333/dashboard
```

For reproducible production deployments, prefer pinning a specific Qdrant version instead of using `latest`.

---

# Configuration

Copy the example configuration:

```bash
mkdir -p .pi
cp examples/rag.json .pi/rag.json
```

`pi-rag` searches for configuration in the following ways:

- project configuration: `.pi/rag.json`;
- global configuration: `~/.pi/agent/rag.json`;
- explicit configuration selected with `PI_RAG_CONFIG`.

Example:

### macOS / Linux

```bash
export PI_RAG_CONFIG="$HOME/.pi/agent/rag.json"
```

### Windows PowerShell

```powershell
$env:PI_RAG_CONFIG = "$HOME\.pi\agent\rag.json"
```

Secrets must not be written directly into `rag.json`. `apiKeyEnv` contains the **name of an environment variable**, not the secret itself.

---

# `rag.json` reference

A typical configuration looks like this:

```json
{
  "version": 1,
  "embeddingProviders": {
    "local": {
      "type": "openai-compatible",
      "baseUrl": "http://localhost:11434/v1",
      "model": "qwen3-embedding:0.6b",
      "expectedDimensions": 1024,
      "queryTemplate": "Instruct: Given a user question in French or English, retrieve relevant passages from enterprise documents that answer the question\nQuery: {{query}}"
    }
  },
  "vectorStores": {
    "qdrant-local": {
      "type": "qdrant",
      "url": "http://localhost:6333",
      "apiKeyEnv": "QDRANT_API_KEY"
    }
  },
  "knowledgeBases": {
    "contract-library": {
      "description": "Contracts and contractual precedents",
      "vectorStore": "qdrant-local",
      "embeddingProvider": "local",
      "collection": "contracts",
      "vectorName": "text",
      "dimensions": 1024,
      "distance": "cosine",
      "payload": {
        "content": "content",
        "title": "document_title",
        "source": "source_path",
        "page": "page",
        "section": "section",
        "metadata": ["customer", "contract_type", "year", "business_domain"]
      },
      "filterableFields": ["customer", "contract_type", "year", "business_domain", "document_type"],
      "search": {
        "topK": 8,
        "maxTopK": 30,
        "scoreThreshold": 0.45,
        "maxCharsPerChunk": 4000,
        "maxTotalChars": 20000
      },
      "ingestion": {
        "inputDirectory": "./data/contracts",
        "recursive": true,
        "chunking": {
          "strategy": "docling-hybrid",
          "maxTokens": 700
        },
        "embeddingText": {
          "includeTitle": true,
          "includeHeadings": true
        },
        "batchSize": 32,
        "timeoutSeconds": 60,
        "maxRetries": 3,
        "distance": "cosine"
      }
    }
  }
}
```

## Top-level `version`

```json
"version": 1
```

The current schema accepts version `1`.

## `embeddingProviders`

`embeddingProviders` is a dictionary of named embedding configurations. A knowledge base refers to one of these names through `embeddingProvider`.

### OpenAI-compatible example

```json
"embeddingProviders": {
  "enterprise": {
    "type": "openai-compatible",
    "baseUrl": "https://gateway.example.com/v1",
    "model": "my-embedding-model",
    "apiKeyEnv": "EMBEDDING_API_KEY",
    "expectedDimensions": 1024,
    "queryTemplate": "{{query}}",
    "timeoutSeconds": 60,
    "maxRetries": 3
  }
}
```

| Property | Required | Meaning |
|---|---:|---|
| `type` | yes | `openai-compatible` or `ollama` |
| `baseUrl` | yes | Provider base URL |
| `model` | yes | Model name sent to the provider |
| `apiKeyEnv` | no | Environment variable containing the API key/token |
| `expectedDimensions` | no | Expected query-vector size; retrieval fails if the provider returns another dimension |
| `queryTemplate` | no | Template applied to retrieval queries; `{{query}}` is replaced with the user's query |
| `timeoutSeconds` | no | Provider timeout, default `60` |
| `maxRetries` | no | Retry count, default `3` |

`queryTemplate` affects **query embeddings generated by the Pi extension**. It can be useful for models that expect an instruction or a query-specific prefix.

Example:

```json
"queryTemplate": "Represent this sentence for searching relevant passages: {{query}}"
```

The text embedded during ingestion must remain compatible with the same embedding model and retrieval strategy.

### API token on macOS / Linux

```bash
export EMBEDDING_API_KEY='your-token'
```

### API token on Windows PowerShell

```powershell
$env:EMBEDDING_API_KEY = "your-token"
```

The environment variable must be present in the environment from which Pi or the ingestion process is launched.

### Ollama example

```json
"embeddingProviders": {
  "ollama": {
    "type": "ollama",
    "baseUrl": "http://localhost:11434",
    "model": "qwen3-embedding:0.6b",
    "expectedDimensions": 1024,
    "queryTemplate": "{{query}}"
  }
}
```

## `vectorStores`

Choose the adapter with `type`. Connection secrets are always referenced by environment-variable name.

```json
"vectorStores": {
  "qdrant-local": {
    "type": "qdrant",
    "url": "http://localhost:6333"
  }
}
```

Authenticated Qdrant:

```json
"vectorStores": {
  "qdrant-prod": {
    "type": "qdrant",
    "url": "https://qdrant.example.com",
    "apiKeyEnv": "QDRANT_API_KEY"
  }
}
```

Set the secret outside the JSON.

### macOS / Linux

```bash
export QDRANT_API_KEY='your-key'
```

### Windows PowerShell

```powershell
$env:QDRANT_API_KEY = "your-key"
```

| Property | Required | Meaning |
|---|---:|---|
| `type` | yes | `qdrant` |
| `url` | yes | Qdrant REST endpoint |
| `apiKeyEnv` | no | environment variable containing the Qdrant API key |

### PostgreSQL / pgvector

```json
"vectorStores": {
  "postgres": {
    "type": "pgvector",
    "connectionStringEnv": "PI_RAG_DATABASE_URL",
    "ssl": true,
    "schema": "rag",
    "idColumn": "id",
    "maxConnections": 10,
    "idleTimeoutSeconds": 30
  }
}
```

Set `PI_RAG_DATABASE_URL=postgresql://user:password@host/database` outside JSON. Instead of `connectionStringEnv`, you may configure `host`, `port`, `database`, `user`, and `passwordEnv`. `schema` defaults to `public`, `idColumn` to `id`, and the vector column is selected by the knowledge base's `vectorName` (default `embedding`). The PostgreSQL role needs read-only access to the selected schema/table. The `vector` extension and a compatible vector index must already exist.

### ChromaDB

```json
"vectorStores": {
  "chroma": {
    "type": "chroma",
    "url": "http://localhost:8000",
    "tenant": "default_tenant",
    "database": "default_database",
    "apiKeyEnv": "CHROMA_API_KEY",
    "apiKeyHeader": "x-chroma-token"
  }
}
```

`tenant` and `database` use the shown defaults. Omit both authentication properties for a local unauthenticated server. For hosted or proxied deployments, `apiKeyHeader` lets you select the header expected by the service. Chroma's native `documents` value is used as chunk content; `payload` maps title/source/page/section and extra fields from Chroma metadata.

Complete ready-to-copy configurations are provided in `examples/rag.json`, `examples/rag-pgvector.json`, and `examples/rag-chroma.json`.

## `knowledgeBases`

Each entry in `knowledgeBases` is a logical knowledge base exposed to Pi.

Example:

```json
"knowledgeBases": {
  "contract-library": {
    "description": "Contracts and precedents",
    "vectorStore": "qdrant-local",
    "embeddingProvider": "local",
    "collection": "contracts"
  }
}
```

The key (`contract-library`) is the logical name used by `rag_search`, `rag_status`, and `--knowledge-base`. It is not a filesystem path.

### Main properties

| Property | Required | Meaning |
|---|---:|---|
| `description` | no | Human-readable description exposed to the agent |
| `vectorStore` | yes | Name of an entry in `vectorStores` |
| `embeddingProvider` | yes | Name of an entry in `embeddingProviders` |
| `collection` | yes | Qdrant/Chroma collection or pgvector table |
| `vectorName` | no | Qdrant named vector or pgvector column (default `embedding` for pgvector; unused by Chroma) |
| `dimensions` | Chroma: yes | Vector dimensions; also a fallback for unconstrained pgvector columns |
| `distance` | no | `cosine` (default), `dot`, `euclid`, or `manhattan` |
| `payload` | no | Maps generic RAG fields to payload, metadata, or SQL columns |
| `filterableFields` | no | Fields allowed in search filters |
| `search` | no | Retrieval limits and thresholds |
| `ingestion` | no | Settings used by the Python Qdrant ingestion CLI |

## `payload`

The payload mapping tells `pi-rag` which backend fields contain the returned text and source information. With pgvector these are column names; with Qdrant they are payload keys; with Chroma all except content are metadata keys (content comes from the native document).

```json
"payload": {
  "content": "content",
  "title": "document_title",
  "source": "source_path",
  "page": "page",
  "section": "section",
  "metadata": ["customer", "contract_type", "year"]
}
```

Properties:

- `content`: field containing the chunk text. Defaults to `content`.
- `title`: optional document title field.
- `source`: optional source path or source identifier.
- `page`: optional page number field.
- `section`: optional section field.
- `metadata`: additional payload fields returned with search hits.

This mapping is especially important when querying a collection or table created by another ingestion pipeline.

## `filterableFields`

Only fields explicitly declared here can be used as RAG filters:

```json
"filterableFields": ["customer", "contract_type", "year", "business_domain", "document_type"]
```

Example agent filter:

```json
{
  "and": [
    {"field": "contract_type", "op": "eq", "value": "customer"},
    {"field": "year", "op": "gte", "value": 2022}
  ]
}
```

Filters are compiled into the backend-native syntax and values are parameterized for PostgreSQL. Declaring a field as filterable also lets the Qdrant ingestion script create appropriate payload indexes.

## `search`

```json
"search": {
  "topK": 8,
  "maxTopK": 30,
  "scoreThreshold": 0.45,
  "maxCharsPerChunk": 4000,
  "maxTotalChars": 20000
}
```

| Property | Default | Meaning |
|---|---:|---|
| `topK` | `8` | Default number of retrieved chunks |
| `maxTopK` | `30` | Maximum value accepted for a requested `top_k` |
| `scoreThreshold` | none | Optional minimum similarity score |
| `maxCharsPerChunk` | `4000` | Maximum chunk text returned to Pi |
| `maxTotalChars` | `20000` | Maximum combined text returned by one search |

These limits keep RAG results bounded before they are inserted into the agent context.

---

# Ingestion configuration

The `ingestion` object is consumed by `scripts/ingest_qdrant.py`.

```json
"ingestion": {
  "inputDirectory": "./data/contracts",
  "recursive": true,
  "chunking": {
    "strategy": "docling-hybrid",
    "maxTokens": 700
  },
  "embeddingText": {
    "includeTitle": true,
    "includeHeadings": true
  },
  "batchSize": 32,
  "timeoutSeconds": 60,
  "maxRetries": 3,
  "distance": "cosine"
}
```

### `inputDirectory`

Default directory containing the corpus. It can be overridden with `--input`.

### `recursive`

When `true`, subdirectories are traversed recursively.

### `chunking`

The current GitHub ingestion script uses Docling's `HybridChunker`.

```json
"chunking": {
  "strategy": "docling-hybrid",
  "maxTokens": 700,
  "tokenizer": "Qwen/Qwen3-Embedding-0.6B"
}
```

`tokenizer` is optional in the current script. If omitted, the current script defaults to `Qwen/Qwen3-Embedding-0.6B`.

The tokenizer is used for chunk-size accounting. It is separate from the remote embedding request itself.

In restricted/offline environments, the tokenizer and Docling model artifacts may need to be available locally.

### `embeddingText`

Controls the text sent to the embedding provider for each chunk:

```json
"embeddingText": {
  "includeTitle": true,
  "includeHeadings": true
}
```

When enabled, the script prefixes the chunk with the document title and/or section headings before embedding it. The original chunk content stored in the Qdrant payload remains available separately.

### `batchSize`

Number of chunk texts sent in one embedding request. The command-line `--batch-size` option overrides it.

### `timeoutSeconds`

Embedding HTTP timeout.

### `maxRetries`

Number of retries for transient embedding errors.

### `distance`

Qdrant vector distance, for example `cosine`. The existing collection must use a compatible vector dimension and distance.

### Optional `filterFields`

The ingestion script can use explicit Qdrant payload index types:

```json
"filterFields": {
  "customer": "keyword",
  "contract_type": "keyword",
  "year": "integer"
}
```

If not specified, common numeric fields such as `year`, `page`, and `chunk_index` are treated as integer fields; other filterable fields default to keyword indexes.

---

# Supported ingestion file types

The current ingestion script discovers:

```text
.pdf
.docx
.pptx
.xlsx
.html
.htm
.md
.txt
.doc
.ppt
.xls
.odt
.ods
.odp
.png
.jpg
.jpeg
.tiff
```

Actual parsing support can also depend on the installed Docling stack and system/model availability.

Temporary Microsoft Office files beginning with `~$` are ignored. Hidden files and directories are ignored by default.

---

# Metadata files

A corpus can include an optional `metadata.csv` or `metadata.json` next to the documents.

## CSV

The CSV must contain a `source_path` column.

```csv
source_path,customer,contract_type,year,business_domain
01-contract.pdf,ACME,customer,2026,naval
02-framework.docx,ExampleCo,supplier,2025,engineering
```

`source_path` must match the path relative to the ingestion root. Simple CSV values are automatically converted to booleans, integers, or floats when possible.

## JSON list

```json
[
  {
    "source_path": "01-contract.pdf",
    "customer": "ACME",
    "contract_type": "customer",
    "year": 2026
  }
]
```

## JSON object

```json
{
  "01-contract.pdf": {
    "customer": "ACME",
    "year": 2026
  }
}
```

---

# Running the ingestion CLI

The logical knowledge-base name is mandatory.

## macOS / Linux

Using the input directory from `rag.json`:

```bash
python scripts/ingest_qdrant.py \
  --config .pi/rag.json \
  --knowledge-base contract-library
```

Using a global config:

```bash
python scripts/ingest_qdrant.py \
  --config "$HOME/.pi/agent/rag.json" \
  --knowledge-base contract-library
```

Override the corpus directory:

```bash
python scripts/ingest_qdrant.py \
  --config "$HOME/.pi/agent/rag.json" \
  --knowledge-base contract-library \
  --input ./test-docs \
  --verbose
```

Dry run:

```bash
python scripts/ingest_qdrant.py \
  --config .pi/rag.json \
  --knowledge-base contract-library \
  --dry-run
```

## Windows PowerShell

```powershell
.\.venv\Scripts\python.exe scripts\ingest_qdrant.py `
  --config "$HOME\.pi\agent\rag.json" `
  --knowledge-base contract-library `
  --input .\test-docs `
  --verbose
```

Dry run:

```powershell
.\.venv\Scripts\python.exe scripts\ingest_qdrant.py `
  --config .pi\rag.json `
  --knowledge-base contract-library `
  --dry-run
```

---

# Ingestion CLI options

## `--config`

Configuration file. Default: `.pi/rag.json`.

## `--knowledge-base`

Required logical name under `knowledgeBases`.

```bash
--knowledge-base contract-library
```

## `--input`

Overrides `ingestion.inputDirectory`. It can point to a directory or one supported file.

## `--include`

Repeatable include glob pattern.

```bash
--include "*.pdf" --include "*.docx"
```

Patterns are matched against both the relative path and filename.

## `--exclude`

Repeatable exclude glob pattern.

```bash
--exclude "*draft*" --exclude "archive/*"
```

## `--batch-size`

Overrides `ingestion.batchSize`.

```bash
--batch-size 8
```

Use a smaller batch if an embedding gateway imposes payload limits.

## `--dry-run`

Parses and chunks documents without creating embeddings or writing vectors to Qdrant.

## `--force`

Normally, a document whose current content version is already present is skipped. `--force` processes it again.

## `--sync`

After ingestion, deletes Qdrant documents whose `document_id` is no longer present in the current input corpus.

Use this carefully: the input corpus becomes the source of truth for that collection.

## `--recreate`

Deletes and recreates the configured Qdrant collection before ingestion. This is destructive and normally asks for confirmation.

## `--yes`

Automatically confirms destructive prompts, especially with `--recreate`.

```bash
--recreate --yes
```

## `--fail-fast`

Stops on the first file error instead of continuing.

## `--include-hidden`

Includes hidden files and directories that are ignored by default.

## `--verbose`

Prints individual ingestion errors to stderr.

---

# Idempotency and document updates

The ingestion script computes SHA-256 based identifiers.

A document version is derived from the file contents. If the same source path and document version already exist in Qdrant, the file is skipped unless `--force` is used.

When an updated document is successfully written, obsolete versions of the same `document_id` are removed.

This lets repeated ingestion runs avoid re-embedding unchanged files while keeping updated documents synchronized.

---

# Ingestion reports

Each execution writes a JSON report under `.ingestion/` relative to the configuration location.

For example, with:

```text
~/.pi/agent/rag.json
```

reports are written under:

```text
~/.pi/.ingestion/
```

A report includes selected knowledge base, collection, files discovered/processed/skipped/failed, chunks created, vectors inserted, embedding model, detected dimension, distance, errors, and duration.

Inspect a report on macOS/Linux without `jq`:

```bash
python -m json.tool ~/.pi/.ingestion/contract-library-YYYYMMDD-HHMMSS.json
```

---

# Environment variables and secrets

## OpenAI-compatible embedding gateway

`rag.json`:

```json
{
  "apiKeyEnv": "EMBEDDING_API_KEY"
}
```

macOS / Linux:

```bash
export EMBEDDING_API_KEY='secret'
```

Windows PowerShell:

```powershell
$env:EMBEDDING_API_KEY = "secret"
```

## Qdrant API key

macOS / Linux:

```bash
export QDRANT_API_KEY='secret'
```

Windows PowerShell:

```powershell
$env:QDRANT_API_KEY = "secret"
```

Do not commit secrets to `rag.json`.

The current code does not automatically load a `.env` file.

---

# Enterprise TLS / internal CAs

Internal API gateways may use a private corporate CA.

For Python/httpx ingestion, configure the trusted CA instead of disabling TLS verification:

```bash
export SSL_CERT_FILE=/path/to/company-ca-bundle.pem
```

For the Node.js Pi extension, an additional enterprise CA can commonly be provided with:

```bash
export NODE_EXTRA_CA_CERTS=/path/to/company-ca-bundle.pem
```

Windows PowerShell:

```powershell
$env:SSL_CERT_FILE = "C:\path\company-ca-bundle.pem"
$env:NODE_EXTRA_CA_CERTS = "C:\path\company-ca-bundle.pem"
```

Avoid permanently disabling certificate verification.

---

# Offline Docling / Hugging Face usage

Docling may require model artifacts for document layout, table structure, OCR, or other processing steps.

In restricted environments, pre-populate the required Hugging Face cache and run with:

### macOS / Linux

```bash
HF_HUB_OFFLINE=1 python scripts/ingest_qdrant.py \
  --config "$HOME/.pi/agent/rag.json" \
  --knowledge-base contract-library
```

or:

```bash
export HF_HUB_OFFLINE=1
```

### Windows PowerShell

```powershell
$env:HF_HUB_OFFLINE = "1"
```

Offline mode only works when all required model artifacts and revision references are already present in the local cache.

---

# Using pi-rag in Pi

Restart Pi after installation or after rebuilding the local extension.

### macOS / Linux

```bash
pi
```

### Windows

```powershell
pi.cmd
```

List configured knowledge bases:

```text
/rag
```

Ask Pi to search a knowledge base:

```text
/rag What obligations apply to the supplier?
```

The command instructs the agent to use `rag_search` and preserve source citations in its answer.

The extension does not add a dedicated RAG panel to the UI.

---

# Agent tools

## `rag_list`

Lists configured logical knowledge bases and their descriptions.

## `rag_search`

Embeds a query, searches the configured vector collection or table, and returns bounded chunks with source metadata.

Main arguments include `query`, `knowledge_base`, `top_k`, and optional filters.

## `rag_status`

Checks knowledge-base configuration and connectivity, including the embedding provider and vector index information, without exposing secrets.

---

# Search filters

Only fields listed under `filterableFields` may be used.

Example:

```json
{
  "and": [
    {"field": "contract_type", "op": "eq", "value": "customer"},
    {"field": "year", "op": "gte", "value": 2022}
  ]
}
```

Use metadata and payload indexes for frequently filtered fields.

---

# Query-time compatibility requirements

The embedding model used by the Pi extension must be compatible with the model used to create the vectors stored in Qdrant.

Keep these aligned:

- model semantics;
- vector dimension;
- normalization/distance assumptions;
- query/document instruction strategy;
- collection;
- vector name.

For example, if documents were embedded as 1024-dimensional vectors, a 768-dimensional query embedding cannot be searched against the same dense-vector field.

`expectedDimensions` can be used to detect an unexpected query-vector size before sending it to Qdrant.

---

# Using an existing Qdrant collection

The Python ingestion script is optional.

You can point `pi-rag` at an existing Qdrant collection produced by another system as long as:

1. the query embedding provider is compatible with the stored vectors;
2. `collection` and `vectorName` are correct;
3. the configured payload mapping matches the existing Qdrant payload fields;
4. any filter fields are declared in `filterableFields`.

Example:

```json
{
  "knowledgeBases": {
    "existing-corpus": {
      "description": "Existing enterprise vector corpus",
      "vectorStore": "qdrant-prod",
      "embeddingProvider": "enterprise-embedding",
      "collection": "enterprise-documents",
      "vectorName": "dense",
      "payload": {
        "content": "text",
        "title": "title",
        "source": "uri",
        "page": "page_number",
        "section": "heading",
        "metadata": ["department", "classification"]
      },
      "filterableFields": ["department", "classification"]
    }
  }
}
```

---

# Multiple knowledge bases

A single `rag.json` can declare several knowledge bases. They may mix Qdrant, pgvector, and ChromaDB stores, collections or tables, vector fields, embedding providers, search thresholds, payload mappings, and metadata filters.

```json
{
  "version": 1,
  "embeddingProviders": {
    "local": {
      "type": "openai-compatible",
      "baseUrl": "http://localhost:11434/v1",
      "model": "qwen3-embedding:0.6b",
      "expectedDimensions": 1024
    }
  },
  "vectorStores": {
    "local-qdrant": {
      "type": "qdrant",
      "url": "http://localhost:6333"
    }
  },
  "knowledgeBases": {
    "contracts": {
      "description": "Contracts",
      "vectorStore": "local-qdrant",
      "embeddingProvider": "local",
      "collection": "contracts",
      "vectorName": "text"
    },
    "technical-docs": {
      "description": "Technical documentation",
      "vectorStore": "local-qdrant",
      "embeddingProvider": "local",
      "collection": "technical-docs",
      "vectorName": "text"
    }
  }
}
```

---

# Tests

```bash
npm ci
npm run check
npm test
npm run build
```

Python tests on macOS/Linux:

```bash
python -m unittest discover -s test/python
```

Windows:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s test\python
```

---

# Development notes

The source tree separates generic interfaces from implementations:

```text
src/
├── config/
├── core/
├── embeddings/
├── stores/
│   ├── vector-store-adapter.ts
│   └── qdrant/
├── tools/
└── index.ts
```

`VectorStoreAdapter` defines the generic retrieval contract:

- `healthCheck(...)`
- `describe(...)`
- `search(...)`
- optional `close()`

This makes additional vector databases technically possible, but each backend still requires:

1. a concrete adapter implementation;
2. adapter registration/factory wiring;
3. configuration-schema support;
4. mapping of filters and metadata semantics;
5. tests.

Qdrant, pgvector, and ChromaDB are implemented. A new backend only needs another `VectorStoreAdapter`, its configuration-schema variant, factory registration, and native filter translation; the service, tools, embedding providers, result formatting, and budgets remain shared.

---

# Publishing

The npm package is:

```text
@raguets/pi-rag
```

Validate before publishing:

```bash
npm ci
npm run check
npm test
npm run build
npm pack --dry-run
```

Create and inspect a real tarball:

```bash
npm pack
```

Publish a public scoped package:

```bash
npm publish --access public
```

Verify:

```bash
npm view @raguets/pi-rag
```

Test directly through Pi:

```bash
pi -e npm:@raguets/pi-rag
```

Install:

```bash
pi install npm:@raguets/pi-rag
```

For a new release:

```bash
npm version patch
git push origin main --follow-tags
npm publish --access public
```

Do not overwrite an existing npm release.

---

# Troubleshooting

## `RAG_VECTOR_DIMENSION_MISMATCH`

The query embedding dimension does not match `expectedDimensions`. Check the embedding model, gateway model alias, configured dimension, and Qdrant vector-field dimension.

## Embedding HTTP 401 / 403

Check the environment variable referenced by `apiKeyEnv`.

macOS / Linux:

```bash
echo "${EMBEDDING_API_KEY:+set}"
```

Windows PowerShell:

```powershell
if ($env:EMBEDDING_API_KEY) { "set" } else { "missing" }
```

Do not print production tokens into shared logs.

## TLS certificate errors

Configure your corporate CA using `SSL_CERT_FILE` for Python and, where applicable, `NODE_EXTRA_CA_CERTS` for Node.js.

## Qdrant connection errors

```bash
curl http://localhost:6333
docker ps
docker logs qdrant
```

## Unchanged files are skipped

This is normal idempotent behavior. Use `--force` to process them again.

## Need a completely fresh collection

Use:

```bash
--recreate
```

or non-interactively:

```bash
--recreate --yes
```

This deletes the configured collection.

## Docling tries to access Hugging Face in an offline environment

Preload all required model artifacts and revisions, then use:

```bash
export HF_HUB_OFFLINE=1
```

The exact required models depend on the installed Docling version and document-processing pipeline.

---

# Security

- Do not store API keys or tokens directly in `rag.json`.
- Use `apiKeyEnv`.
- Do not commit `.env` files, enterprise documents, local ingestion reports, or private certificates.
- Keep Qdrant and embedding endpoints restricted according to your deployment requirements.
- Prefer trusted CA bundles over disabling TLS verification.
- Treat retrieved documents and metadata according to their classification and access-control requirements.

---

# License

MIT
