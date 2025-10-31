
// api/crawl
import { Request, Response } from 'express';
import { chunkText, generateEmbedding } from '../lib/embeddings.js';
import { delay, scrapeUrl } from '../lib/firecrawl.js';
import { createLogger } from '../lib/logger.js';
import { addUserToDomain, checkDomainExists, upsertVectors } from '../lib/firebase.js';

const logger = createLogger('CrawlRoute');


export async function crawlFirebaseHandler(req: Request, res: Response) {
    const { urls, userEmail } = req.body;

    // Set up SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const sendProgress = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        sendProgress({ type: 'start', message: 'Starting crawl process...', progress: 0 });

        const results = [];
        const errors = [];
        const totalUrls = Math.min(urls.length, 10);

        for (let i = 0; i < totalUrls; i++) {
            const url = urls[i];
            const progress = Math.round((i / totalUrls) * 100);

            try {
                sendProgress({
                    type: 'progress',
                    message: `Processing ${i + 1}/${totalUrls}: ${url}`,
                    progress,
                    currentUrl: url
                });

                const domain = new URL(url).hostname;
                const domainExists = await checkDomainExists(url);

                if (domainExists) {
                    const result = await addUserToDomain(userEmail, domain);
                    results.push({
                        url,
                        success: true,
                        chunks: 0,
                        vectors: result.vectorsUpdated,
                        wasAlreadyIndexed: true,
                    });

                    sendProgress({
                        type: 'url_complete',
                        message: `Domain already indexed: ${domain}`,
                        url,
                        wasAlreadyIndexed: true
                    });
                    continue;
                }

                // Scraping phase
                sendProgress({
                    type: 'scraping',
                    message: `Scraping content from ${url}...`,
                    url
                });

                const scrapeResult = await scrapeUrl(url);
                if (!scrapeResult) throw new Error('Scraping failed');

                const content = scrapeResult.markdown || scrapeResult.html || '';
                if (!content) throw new Error('No content extracted');

                // Chunking phase
                sendProgress({
                    type: 'chunking',
                    message: `Creating content chunks...`,
                    url
                });

                const chunks = chunkText(content);

                // Embedding phase
                sendProgress({
                    type: 'embedding',
                    message: `Generating embeddings (${chunks.length} chunks)...`,
                    url,
                    totalChunks: chunks.length
                });

                const vectors = [];
                for (let j = 0; j < chunks.length; j++) {
                    const chunk = chunks[j];
                    const embedding = await generateEmbedding(chunk);

                    vectors.push({
                        id: `${domain}_${Date.now()}_chunk_${j}`,
                        values: embedding,
                        metadata: {
                            url,
                            text: chunk,
                            chunkIndex: j,
                            totalChunks: chunks.length,
                            timestamp: new Date().toISOString(),
                        },
                    });

                    // Progress within embedding generation
                    if (j % 10 === 0) {
                        sendProgress({
                            type: 'embedding_progress',
                            message: `Generated ${j + 1}/${chunks.length} embeddings...`,
                            url,
                            embeddingProgress: Math.round((j / chunks.length) * 100)
                        });
                    }

                    await delay(100);
                }

                // Indexing phase
                sendProgress({
                    type: 'indexing',
                    message: `Storing in vector database...`,
                    url
                });

                await upsertVectors(vectors, userEmail);

                results.push({
                    url,
                    success: true,
                    chunks: chunks.length,
                    vectors: vectors.length,
                });

                sendProgress({
                    type: 'url_complete',
                    message: `Completed: ${url}`,
                    url,
                    chunks: chunks.length,
                    vectors: vectors.length
                });

                await delay(1000);

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                errors.push({ url, error: errorMessage });

                sendProgress({
                    type: 'url_error',
                    message: `Error processing ${url}: ${errorMessage}`,
                    url,
                    error: errorMessage
                });
            }
        }

        // Final completion
        sendProgress({
            type: 'complete',
            message: `Crawl completed! Processed: ${results.length}, Failed: ${errors.length}`,
            progress: 100,
            results,
            errors
        });

    } catch (error) {
        sendProgress({
            type: 'error',
            message: `Crawl failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }

    res.end();
}