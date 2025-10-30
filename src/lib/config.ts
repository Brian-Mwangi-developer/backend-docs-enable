import dotenv from 'dotenv';

dotenv.config();

export const config = {
    firecrawl: {
        apiKey: process.env.FIRECRAWL_API_KEY || '',
        baseUrl: process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev',
    },
    pinecone: {
        apiKey: process.env.PINECONE_API_KEY!,
        host: process.env.PINECONE_HOST!,
        index: process.env.PINECONE_INDEX!,
    },
    openai: {
        apiKey: process.env.EMBEDDING_API_KEY!,
        apiUrl: process.env.EMBEDDING_API_URL!,
        model: process.env.EMBEDDING_MODEL || 'text-embedding-ada-002',
    },
    processing: {
        chunkSize: parseInt(process.env.CHUNK_SIZE || '500'),
        maxChunksPerDoc: parseInt(process.env.MAX_CHUNKS_PER_DOC || '30'),
        maxUrlsToCrawl: parseInt(process.env.MAX_URLS_TO_CRAWL || '5'),
        debug: process.env.DEBUG === 'true',
    },
    server: {
        port: parseInt(process.env.PORT || '3000'),
        nodeEnv: process.env.NODE_ENV || 'development',
    },
};

// Validate required environment variables
const requiredEnvVars = [
    'PINECONE_API_KEY',
    'PINECONE_HOST',
    'PINECONE_INDEX',
    'EMBEDDING_API_KEY',
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
    }
}
