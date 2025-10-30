import { config } from './config.js';
import FirecrawlApp from '@mendable/firecrawl-js';



let firecrawlClient: FirecrawlApp | null = null;


export function getFirecrawlClient() {
    if (!firecrawlClient) {
        firecrawlClient = new FirecrawlApp({
            apiKey: config.firecrawl.apiKey,
        });
    }
    return firecrawlClient;
}

export async function scrapeUrl(url: string) {
    try {
        const app = getFirecrawlClient();
        const result = await app.scrape(url);

        return result;
    } catch (error) {
        console.error('Error scraping URL:', error);
        throw error;
    }
} export async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
