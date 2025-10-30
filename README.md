# Documentation Indexing Backend

A TypeScript-based Node.js backend service for indexing and searching documentation using Pinecone vector database and OpenAI embeddings.

## Features

- **Web Scraping**: Extract content from documentation websites
- **Sitemap Parsing**: Automatically discover URLs from sitemaps
- **Text Chunking**: Split large documents into manageable chunks
- **Vector Embeddings**: Generate embeddings using OpenAI's API
- **Vector Storage**: Store and query embeddings in Pinecone
- **Semantic Search**: Search documentation using natural language queries

## Prerequisites

- Node.js 18+
- npm or yarn
- Pinecone account and API key
- OpenAI API key

## Installation

1. Clone the repository and navigate to the project directory:

```bash
cd docs-enable
```

2. Install dependencies:

```bash
npm install
```

3. Configure environment variables:

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

Edit `.env` with your actual credentials:

```env
# Pinecone Configuration
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_HOST=your_pinecone_host
PINECONE_INDEX=your_index_name

# OpenAI Configuration
EMBEDDING_API_KEY=your_openai_api_key

# Optional: Firecrawl for advanced scraping
FIRECRAWL_API_KEY=your_firecrawl_api_key
```

## Usage

### Development Mode

Start the server in development mode with hot reload:

```bash
npm run dev
```

### Production Mode

Build and start the server:

```bash
npm run build
npm start
```

### Type Checking

Run TypeScript type checking:

```bash
npm run type-check
```

## API Endpoints

### Health Check

```bash
GET /health
```

Check if the server is running.

### Root

```bash
GET /
```

Get API information and available endpoints.

### Crawl URLs

```bash
POST /api/crawl
Content-Type: application/json

{
  "urls": [
    "https://example.com/docs/page1",
    "https://example.com/docs/page2"
  ]
}
```

Crawls the specified URLs, extracts content, generates embeddings, and stores them in Pinecone.

**Response:**

```json
{
  "success": true,
  "processed": 2,
  "failed": 0,
  "results": [
    {
      "url": "https://example.com/docs/page1",
      "success": true,
      "chunks": 5,
      "vectors": 5
    }
  ],
  "errors": []
}
```

### Extract Sitemap

```bash
POST /api/sitemap
Content-Type: application/json

{
  "url": "https://example.com"
}
```

Extracts URLs from the website's sitemap.

**Response:**

```json
{
  "success": true,
  "sitemapUrl": "https://example.com/sitemap.xml",
  "urls": ["https://example.com/page1", "https://example.com/page2"],
  "totalUrls": 100
}
```

### Search

```bash
POST /api/search
Content-Type: application/json

{
  "query": "How do I authenticate users?",
  "topK": 5
}
```

Performs semantic search on indexed documentation.

**Response:**

```json
{
  "success": true,
  "query": "How do I authenticate users?",
  "results": [
    {
      "score": 0.89,
      "url": "https://example.com/docs/auth",
      "text": "Authentication is handled using...",
      "chunkIndex": 0
    }
  ]
}
```

## Configuration

All configuration is managed through environment variables:

| Variable             | Description                  | Default                  |
| -------------------- | ---------------------------- | ------------------------ |
| `PORT`               | Server port                  | `3000`                   |
| `NODE_ENV`           | Environment                  | `development`            |
| `PINECONE_API_KEY`   | Pinecone API key             | Required                 |
| `PINECONE_HOST`      | Pinecone host URL            | Required                 |
| `PINECONE_INDEX`     | Pinecone index name          | Required                 |
| `EMBEDDING_API_KEY`  | OpenAI API key               | Required                 |
| `EMBEDDING_MODEL`    | OpenAI embedding model       | `text-embedding-ada-002` |
| `CHUNK_SIZE`         | Text chunk size              | `500`                    |
| `MAX_CHUNKS_PER_DOC` | Max chunks per document      | `20`                     |
| `MAX_URLS_TO_CRAWL`  | Max URLs from sitemap        | `5`                      |
| `DEBUG`              | Enable debug logging         | `true`                   |
| `FIRECRAWL_API_KEY`  | Firecrawl API key (optional) | -                        |

## Project Structure

```
src/
├── index.ts              # Server entry point
├── lib/
│   ├── config.ts         # Configuration management
│   ├── embeddings.ts     # Embedding generation
│   ├── firecrawl.ts      # Web scraping utilities
│   ├── logger.ts         # Logging utilities
│   └── pinecone.ts       # Pinecone operations
└── routes/
    ├── crawl.ts          # Crawl endpoint handler
    ├── search.ts         # Search endpoint handler
    └── sitemap.ts        # Sitemap endpoint handler
```

## Example Workflow

1. **Extract URLs from sitemap:**

```bash
curl -X POST http://localhost:3000/api/sitemap \
  -H "Content-Type: application/json" \
  -d '{"url": "https://docs.example.com"}'
```

2. **Crawl and index URLs:**

```bash
curl -X POST http://localhost:3000/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://docs.example.com/page1", "https://docs.example.com/page2"]}'
```

3. **Search indexed content:**

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "How to get started?", "topK": 5}'
```

## Error Handling

The API returns appropriate HTTP status codes:

- `200` - Success
- `400` - Bad Request (invalid input)
- `403` - Forbidden (robots.txt disallowed)
- `500` - Internal Server Error

Error responses include details:

```json
{
  "error": "Error message",
  "details": "Detailed error information"
}
```

## Logging

The application includes comprehensive logging:

- Request/response logging
- Debug logging (when `DEBUG=true`)
- Error logging with stack traces
- Timestamps and context for all logs

## License

ISC
