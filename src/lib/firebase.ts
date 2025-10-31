import * as admin from 'firebase-admin';
import { config } from './config-firebase';


let firebaseApp: admin.app.App | null = null;

export function getFirebaseApp(){
    if(!firebaseApp){
        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert({
                projectId: config.firebase.projectId,
                privateKey: config.firebase.privateKey,
                clientEmail: config.firebase.clientEmail,
            }),
        })
    }
    return firebaseApp
}

export function getFirestore() {
    const app = getFirebaseApp();
    return admin.firestore(app);
}


interface DocumentVector {
    id: string;
    url: string;
    text: string;
    embedding: number[];
    chunkIndex: number;
    totalChunks: number;
    timestamp: string;
    domain: string;
    users: string[];
    createdBy: string;
    createdAt: string;
    lastUpdated?: string;
}


export async function checkDomainExists(url: string): Promise<boolean> {
    try {
        const db = getFirestore();
        const domain = new URL(url).hostname;

        const snapshot = await db
            .collection(config.firebase.collectionName)
            .where('domain', '==', domain)
            .limit(1)
            .get();

        return !snapshot.empty;
    } catch (error) {
        console.error('Error checking domain existence:', error);
        return false;
    }
}

export async function addUserToDomain(userEmail: string, domain: string) {
    try {
        const db = getFirestore();
        const batch = db.batch();

        // Get all documents for this domain
        const snapshot = await db
            .collection(config.firebase.collectionName)
            .where('domain', '==', domain)
            .get();

        if (snapshot.empty) {
            throw new Error(`No vectors found for domain: ${domain}`);
        }

        let vectorsUpdated = 0;

        snapshot.docs.forEach(doc => {
            const data = doc.data() as DocumentVector;
            const currentUsers = data.users || [];

            if (!currentUsers.includes(userEmail)) {
                currentUsers.push(userEmail);
                batch.update(doc.ref, {
                    users: currentUsers,
                    lastUpdated: new Date().toISOString()
                });
                vectorsUpdated++;
            }
        });

        if (vectorsUpdated > 0) {
            await batch.commit();
        }

        if (config.processing.debug) {
            console.log(`Added user ${userEmail} to domain ${domain}, updated ${vectorsUpdated} vectors`);
        }

        return { success: true, vectorsUpdated };
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
    userEmail: string
) {
    try {
        const db = getFirestore();
        const batch = db.batch();

        vectors.forEach(vector => {
            const docRef = db.collection(config.firebase.collectionName).doc(vector.id);
            const documentData: DocumentVector = {
                id: vector.id,
                url: vector.metadata.url,
                text: vector.metadata.text,
                embedding: vector.values,
                chunkIndex: vector.metadata.chunkIndex,
                totalChunks: vector.metadata.totalChunks,
                timestamp: vector.metadata.timestamp,
                domain: new URL(vector.metadata.url).hostname,
                users: [userEmail],
                createdBy: userEmail,
                createdAt: new Date().toISOString(),
            };

            batch.set(docRef, documentData);
        });

        await batch.commit();

        if (config.processing.debug) {
            console.log(`Successfully upserted ${vectors.length} vectors to Firebase`);
        }

        return { success: true };
    } catch (error) {
        console.error('Error upserting vectors:', error);
        throw error;
    }
}

// Simple cosine similarity function for vector search
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function queryVectors(
    embedding: number[],
    userEmail: string,
    topK: number = 5,
    domainFilter?: string
) {
    try {
        const db = getFirestore();
        let query = db
            .collection(config.firebase.collectionName)
            .where('users', 'array-contains', userEmail);

        if (domainFilter && typeof domainFilter === 'string' && domainFilter.trim() !== '') {
            query = query.where('domain', '==', domainFilter.trim());
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            return [];
        }

        // Calculate similarity scores and sort
        const results = snapshot.docs
            .map(doc => {
                const data = doc.data() as DocumentVector;
                const score = cosineSimilarity(embedding, data.embedding);

                return {
                    id: data.id,
                    score,
                    metadata: {
                        url: data.url,
                        text: data.text,
                        chunkIndex: data.chunkIndex,
                        domain: data.domain,
                        timestamp: data.timestamp,
                    }
                };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        if (config.processing.debug) {
            console.log(`Found ${results.length} matches for user ${userEmail}`);
        }

        return results;
    } catch (error) {
        console.error('Error querying vectors:', error);
        throw error;
    }
}

export async function getUserDomains(userEmail: string): Promise<string[]> {
    try {
        const db = getFirestore();
        const snapshot = await db
            .collection(config.firebase.collectionName)
            .where('users', 'array-contains', userEmail)
            .get();

        const domains = new Set<string>();
        snapshot.docs.forEach(doc => {
            const data = doc.data() as DocumentVector;
            if (data.domain) {
                domains.add(data.domain);
            }
        });

        return Array.from(domains);
    } catch (error) {
        console.error('Error getting user domains:', error);
        throw error;
    }
}