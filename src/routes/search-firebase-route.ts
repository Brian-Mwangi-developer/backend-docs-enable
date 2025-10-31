import { Request, Response } from 'express';
import { generateEmbedding } from '../lib/embeddings.js';
import { createLogger } from '../lib/logger.js';
import { queryVectors } from '../lib/firebase.js';



const logger = createLogger('SearchRoute');

interface SearchRequest {
    query: string;
    userEmail: string;
    topK?: number;
    domainFilter?: string;
}

export async function searchFirebaseHandler(req: Request, res: Response) {
    try {
        const { query, userEmail, topK, domainFilter } = req.body as SearchRequest;

        if (!query) {
            logger.warn('Invalid request: Query is required');
            return res.status(400).json({
                error: 'Query is required',
            });
        }

        logger.info(`Searching for: "${query}" (topK: ${topK})`);

        // Generate embedding for the query
        const queryEmbedding = await generateEmbedding(query);

        // Search in Firebase
        const results = await queryVectors(queryEmbedding, userEmail, topK, domainFilter);

        // Format results
        const formattedResults = results.map((match) => ({
            score: match.score,
            url: match.metadata?.url,
            text: match.metadata?.text,
            chunkIndex: match.metadata?.chunkIndex,
            domain: match.metadata?.domain,
            timestamp: match.metadata?.timestamp,
        }));

        logger.info(`Found ${formattedResults.length} results for query: "${query}"`);

        return res.json({
            success: true,
            query,
            results: formattedResults,
        });
    } catch (error) {
        logger.error('Error in search:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}