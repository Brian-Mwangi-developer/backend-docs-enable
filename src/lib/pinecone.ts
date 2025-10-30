import { Pinecone } from '@pinecone-database/pinecone';
import { config } from './config.js';

let pineconeClient: Pinecone | null = null;

export function getPineconeClient() {
    if (!pineconeClient) {
        pineconeClient = new Pinecone({
            apiKey: config.pinecone.apiKey,
        });
    }
    return pineconeClient;
}

export async function checkDomainExists(url:string){
    try {
        const pc = getPineconeClient();
        const index = pc.index(config.pinecone.index);

        const domain = new URL(url).hostname;
        const queryResults = await index.query({
            vector: new Array(1536).fill(0.1), // Use a small non-zero vector
            topK: 1,
            filter: {
                domain: { $eq: domain }
            },
            includeMetadata: true,
        });

        return queryResults.matches.length > 0;
    } catch (error) {
        console.error('Error checking domain existence:', error);
        return false;
    }
}

export async function addUserToDomain(userEmail:string,domain:string){
    try {
        const pc = getPineconeClient();
        const index = pc.index(config.pinecone.index);

        // First, get all vector IDs for this domain using pagination
        let allVectorIds: string[] = [];
        let paginationToken: string | undefined;

        do {
            const listResponse = await index.listPaginated({
                limit: 100,
                paginationToken
            });

            // Filter IDs that belong to our domain (assuming ID contains domain info)
            const domainVectorIds = listResponse.vectors?.filter(vectorInfo =>
                vectorInfo.id?.includes(domain)
            ).map(vectorInfo => vectorInfo.id!) || [];

            allVectorIds.push(...domainVectorIds);
            paginationToken = listResponse.pagination?.next;
        } while (paginationToken);

        if (allVectorIds.length === 0) {
            throw new Error(`No vectors found for domain: ${domain}`);
        }

        // Fetch vectors in batches (Pinecone has limits on batch size)
        const batchSize = 100;
        const updatePromises: Promise<any>[] = [];

        for (let i = 0; i < allVectorIds.length; i += batchSize) {
            const batch = allVectorIds.slice(i, i + batchSize);
            const fetchResults = await index.fetch(batch);

            const updatedVectors = Object.entries(fetchResults.records || {}).map(([id, vector]) => {
                const currentUsers = vector.metadata?.users as string[] || [];

                if (!currentUsers.includes(userEmail)) {
                    currentUsers.push(userEmail);

                    return {
                        id,
                        values: vector.values!,
                        metadata: {
                            ...vector.metadata,
                            users: currentUsers,
                            lastUpdated: new Date().toISOString()
                        }
                    };
                }
                return null;
            }).filter(Boolean);

            if (updatedVectors.length > 0) {
                updatePromises.push(index.upsert(updatedVectors as any));
            }
        }

        await Promise.all(updatePromises);

        if (config.processing.debug) {
            console.log(`Added user ${userEmail} to domain ${domain}, updated ${allVectorIds.length} vectors`);
        }

        return { success: true, vectorsUpdated: allVectorIds.length };
    } catch (error) {
        console.error('Error adding user to domain:', error);
        throw error;
    }
}


export async function upsertVectors(
    vectors: Array<{
        id: string;
        values: number[];
        metadata: Record<string, any>;
    }>,
    userEmail:string
) {
    try {
        const pc = getPineconeClient();
        const index = pc.index(config.pinecone.index);
        const enhancedVectors = vectors.map(vector => ({
            ...vector,
            metadata: {
                ...vector.metadata,
                users: [userEmail],
                domain: new URL(vector.metadata.url).hostname,
                createdBy: userEmail,
                createdAt: new Date().toISOString(),
            }
        }));

        await index.upsert(enhancedVectors);

        if (config.processing.debug) {
            console.log(`Successfully upserted ${vectors.length} vectors to Pinecone`);
        }

        return { success: true };
    } catch (error) {
        console.error('Error upserting vectors:', error);
        throw error;
    }
}

export async function queryVectors(embedding: number[],
    userEmail: string,
    topK: number = 5,
    domainFilter?: string) {
    try {
        const pc = getPineconeClient();
        const index = pc.index(config.pinecone.index);

        let filter: any = {
            users: { $in: [userEmail] }
        };

        if (domainFilter && typeof domainFilter === 'string' && domainFilter.trim() !== '') {
            filter.domain = { $eq: domainFilter.trim() };
        }
        if (config.processing.debug) {
            console.log(`Querying vectors for user: ${userEmail}, filter:`, filter);
        }

        const results = await index.query({
            vector: embedding,
            topK,
            filter,
            includeMetadata: true,
            includeValues:false
        });

        if (config.processing.debug) {
            console.log(`Found ${results.matches.length} matches for user ${userEmail}`);
        }

        return results.matches;
    } catch (error) {
        console.error('Error querying vectors:', error);
        throw error;
    }
}


export async function getUserDomains(userEmail: string) {
    try {
        const pc = getPineconeClient();
        const index = pc.index(config.pinecone.index);

        const results = await index.query({
            vector: new Array(1536).fill(0.1), // Use a small non-zero vector
            topK: 10000,
            filter: {
                users: { $in: [userEmail] }
            },
            includeMetadata: true,
            includeValues: false,
        });

        const domains = new Set<string>();
        results.matches.forEach(match => {
            if (match.metadata?.domain) {
                domains.add(match.metadata.domain as string);
            }
        });

        return Array.from(domains);
    } catch (error) {
        console.error('Error getting user domains:', error);
        throw error;
    }
}