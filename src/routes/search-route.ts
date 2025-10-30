// import { Request, Response } from 'express';
// import { generateEmbedding } from '../lib/embeddings.js';
// import { createLogger } from '../lib/logger.js';
// import {
//     queryVectors,
//     getUserDomains,
// } from '../lib/pinecone.js';

// const logger = createLogger('AdvancedSearchRoute');

// interface AdvancedSearchRequest {
//     query: string;
//     userEmail: string;
//     mode?: 'semantic' | 'hybrid' | 'keyword';
//     topK?: number;
//     minScore?: number;
//     domains?: string[];
//     dateRange?: {
//         start: string;
//         end: string;
//     };
//     sortBy?: 'relevance' | 'date' | 'domain';
//     includeSnippets?: boolean;
//     groupByDomain?: boolean;
// }

// export async function advancedSearchHandler(req: Request, res: Response) {
//     const startTime = Date.now();

//     try {
//         const {
//             query,
//             userEmail,
//             mode = 'semantic',
//             topK = 15,
//             minScore = 0.7,
//             domains = [],
//             dateRange,
//             sortBy = 'relevance',
//             includeSnippets = true,
//             groupByDomain = false
//         } = req.body as AdvancedSearchRequest;

//         if (!query || !userEmail) {
//             return res.status(400).json({
//                 success: false,
//                 error: 'Query and userEmail are required'
//             });
//         }

//         logger.info(`Advanced search: ${mode} mode for "${query}" by ${userEmail}`);

//         // Get user domains and validate access
//         const userDomains = await getUserDomains(userEmail);
//         const searchDomains = domains.length > 0
//             ? domains.filter(d => userDomains.includes(d))
//             : userDomains;

//         if (searchDomains.length === 0) {
//             return res.json({
//                 success: true,
//                 query,
//                 results: [],
//                 message: 'No accessible domains found',
//                 searchTime: Date.now() - startTime
//             });
//         }

//         // Generate query embedding based on mode
//         let results = [];

//         switch (mode) {
//             case 'semantic':
//                 results = await performSemanticSearch(query, userEmail, searchDomains, topK);
//                 break;
//             case 'hybrid':
//                 results = await performHybridSearch(query, userEmail, searchDomains, topK);
//                 break;
//             case 'keyword':
//                 results = await performKeywordSearch(query, userEmail, searchDomains, topK);
//                 break;
//         }

//         // Apply filters
//         results = applyFilters(results, { minScore, dateRange });

//         // Sort results
//         results = sortResults(results, sortBy);

//         // Format results
//         const formattedResults = formatResults(results, {
//             includeSnippets,
//             query,
//             groupByDomain
//         });

//         const response = {
//             success: true,
//             query,
//             mode,
//             totalResults: formattedResults.length,
//             results: formattedResults,
//             searchTime: Date.now() - startTime,
//             userDomains,
//             searchDomains,
//             filters: { minScore, dateRange, sortBy }
//         };

//         logger.info(`Advanced search completed: ${formattedResults.length} results in ${response.searchTime}ms`);
//         return res.json(response);

//     } catch (error) {
//         logger.error('Advanced search error:', error);
//         return res.status(500).json({
//             success: false,
//             error: 'Search failed',
//             details: error instanceof Error ? error.message : 'Unknown error',
//             searchTime: Date.now() - startTime
//         });
//     }
// }

// async function performSemanticSearch(
//     query: string,
//     userEmail: string,
//     domains: string[],
//     topK: number
// ) {
//     const queryEmbedding = await generateEmbedding(query);
//     return await queryVectors(queryEmbedding, topK, userEmail, domains);
// }

// async function performHybridSearch(
//     query: string,
//     userEmail: string,
//     domains: string[],
//     topK: number
// ) {
//     // Combine semantic and keyword search
//     const semanticResults = await performSemanticSearch(query, userEmail, domains, Math.floor(topK * 0.7));
//     const keywordResults = await performKeywordSearch(query, userEmail, domains, Math.floor(topK * 0.3));

//     // Merge and deduplicate
//     const combined = [...semanticResults, ...keywordResults];
//     const uniqueResults = combined.filter((result, index, self) =>
//         index === self.findIndex(r => r.id === result.id)
//     );

//     return uniqueResults.slice(0, topK);
// }

// async function performKeywordSearch(
//     query: string,
//     userEmail: string,
//     domains: string[],
//     topK: number
// ) {
//     // Enhanced keyword matching using query terms
//     const keywords = query.toLowerCase().split(/\s+/);
//     const queryEmbedding = await generateEmbedding(query);

//     const allResults = await queryVectors(queryEmbedding, topK * 3, userEmail, domains);

//     // Score boost for keyword matches
//     return allResults.map(result => {
//         const text = (result.metadata?.text || '').toLowerCase();
//         const keywordMatches = keywords.filter(keyword => text.includes(keyword)).length;
//         const keywordBoost = keywordMatches / keywords.length * 0.2;

//         return {
//             ...result,
//             score: Math.min(1.0, result.score + keywordBoost)
//         };
//     }).sort((a, b) => b.score - a.score).slice(0, topK);
// }

// function applyFilters(results: any[], filters: { minScore?: number; dateRange?: any }) {
//     let filtered = results;

//     if (filters.minScore) {
//         filtered = filtered.filter(result => result.score >= filters.minScore);
//     }

//     if (filters.dateRange) {
//         const { start, end } = filters.dateRange;
//         filtered = filtered.filter(result => {
//             const timestamp = result.metadata?.timestamp;
//             if (!timestamp) return true;

//             const date = new Date(timestamp);
//             const startDate = new Date(start);
//             const endDate = new Date(end);

//             return date >= startDate && date <= endDate;
//         });
//     }

//     return filtered;
// }

// function sortResults(results: any[], sortBy: string) {
//     switch (sortBy) {
//         case 'date':
//             return results.sort((a, b) => {
//                 const dateA = new Date(a.metadata?.timestamp || 0).getTime();
//                 const dateB = new Date(b.metadata?.timestamp || 0).getTime();
//                 return dateB - dateA;
//             });
//         case 'domain':
//             return results.sort((a, b) => {
//                 const domainA = a.metadata?.domain || '';
//                 const domainB = b.metadata?.domain || '';
//                 return domainA.localeCompare(domainB);
//             });
//         default: // relevance
//             return results.sort((a, b) => b.score - a.score);
//     }
// }

// function formatResults(results: any[], options: any) {
//     const { includeSnippets, query, groupByDomain } = options;

//     let formatted = results.map(result => {
//         const baseResult = {
//             id: result.id,
//             score: result.score,
//             url: result.metadata?.url || '',
//             domain: result.metadata?.domain || '',
//             chunkIndex: result.metadata?.chunkIndex || 0,
//             totalChunks: result.metadata?.totalChunks || 1,
//             timestamp: result.metadata?.timestamp || ''
//         };

//         if (includeSnippets) {
//             baseResult.snippet = createSnippet(result.metadata?.text || '', query, 200);
//         }

//         return baseResult;
//     });

//     if (groupByDomain) {
//         const grouped = {};
//         formatted.forEach(result => {
//             const domain = result.domain;
//             if (!grouped[domain]) {
//                 grouped[domain] = [];
//             }
//             grouped[domain].push(result);
//         });
//         return { groupedByDomain: grouped, totalResults: formatted.length };
//     }

//     return formatted;
// }

// function createSnippet(text: string, query: string, maxLength: number): string {
//     if (!text) return '';

//     const queryWords = query.toLowerCase().split(/\s+/);
//     const sentences = text.split(/[.!?]+/);

//     // Find sentences containing query terms
//     const relevantSentences = sentences.filter(sentence => {
//         const lowerSentence = sentence.toLowerCase();
//         return queryWords.some(word => lowerSentence.includes(word));
//     });

//     let snippet = relevantSentences.length > 0
//         ? relevantSentences[0]
//         : sentences[0] || text;

//     if (snippet.length > maxLength) {
//         snippet = snippet.substring(0, maxLength - 3) + '...';
//     }

//     // Highlight query terms
//     queryWords.forEach(word => {
//         const regex = new RegExp(`\\b${word}\\b`, 'gi');
//         snippet = snippet.replace(regex, `**${word}**`);
//     });

//     return snippet.trim();
// }

// // Analytics endpoint
// export async function searchAnalyticsHandler(req: Request, res: Response) {
//     try {
//         const { userEmail } = req.body;

//         if (!userEmail) {
//             return res.status(400).json({ error: 'userEmail is required' });
//         }

//         const [userDomains, vectorStats] = await Promise.all([
//             getUserDomains(userEmail),
//             getVectorStats(userEmail)
//         ]);

//         return res.json({
//             success: true,
//             userEmail,
//             domains: userDomains,
//             domainCount: userDomains.length,
//             vectorStats,
//             capabilities: {
//                 semanticSearch: true,
//                 hybridSearch: true,
//                 keywordSearch: true,
//                 filtering: true,
//                 grouping: true
//             }
//         });

//     } catch (error) {
//         logger.error('Analytics error:', error);
//         return res.status(500).json({
//             success: false,
//             error: 'Failed to get analytics'
//         });
//     }
// }

// // Clean up user data
// export async function cleanupUserDataHandler(req: Request, res: Response) {
//     try {
//         const { userEmail, domain } = req.body;

//         if (!userEmail) {
//             return res.status(400).json({ error: 'userEmail is required' });
//         }

//         const result = await deleteUserVectors(userEmail, domain);

//         return res.json({
//             success: true,
//             message: `Deleted ${result.deletedCount} vectors`,
//             deletedCount: result.deletedCount
//         });

//     } catch (error) {
//         logger.error('Cleanup error:', error);
//         return res.status(500).json({
//             success: false,
//             error: 'Failed to cleanup user data'
//         });
//     }
// }