// api/sitemap

import * as cheerio from 'cheerio';
import { Request, Response } from 'express';
import robotsParser from 'robots-parser';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('SitemapRoute');

interface SitemapRequest {
    url: string;
}

export async function sitemapHandler(req: Request, res: Response) {
    try {
        const { url } = req.body as SitemapRequest;

        if (!url) {
            logger.warn('Invalid request: URL is required');
            return res.status(400).json({
                error: 'URL is required',
            });
        }

        logger.info(`Extracting sitemap from ${url}`);

        // Parse URL to get base domain
        const urlObj = new URL(url);
        const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
        const robotsUrl = `${baseUrl}/robots.txt`;

        // Fetch robots.txt
        let sitemapUrl: string | null = null;
        try {
            logger.debug(`Fetching robots.txt from ${robotsUrl}`);
            const robotsResponse = await fetch(robotsUrl);
            const robotsTxt = await robotsResponse.text();
            const robots = robotsParser(robotsUrl, robotsTxt);

            // Extract sitemap URL from robots.txt
            const sitemapMatch = robotsTxt.match(/Sitemap:\s*(.+)/i);
            if (sitemapMatch) {
                sitemapUrl = sitemapMatch[1].trim();
                logger.debug(`Found sitemap in robots.txt: ${sitemapUrl}`);
            }

            // Check if URL is allowed
            const userAgent = '*';
            const isAllowed = robots.isAllowed(url, userAgent);

            if (!isAllowed) {
                logger.warn(`URL ${url} is disallowed by robots.txt`);
                return res.status(403).json({
                    error: 'URL is disallowed by robots.txt',
                });
            }
        } catch (error) {
            logger.warn('Error fetching robots.txt, continuing with default sitemap location:', error);
            // Continue even if robots.txt fails
            sitemapUrl = `${baseUrl}/sitemap.xml`;
        }

        // If no sitemap found, try common locations
        if (!sitemapUrl) {
            sitemapUrl = `${baseUrl}/sitemap.xml`;
        }

        // Fetch sitemap
        let urls: string[] = [];
        try {
            logger.debug(`Fetching sitemap from ${sitemapUrl}`);
            const sitemapResponse = await fetch(sitemapUrl);
            const sitemapXml = await sitemapResponse.text();

            // Parse sitemap XML
            const $ = cheerio.load(sitemapXml, { xmlMode: true });

            $('url > loc').each((_, element) => {
                const urlText = $(element).text().trim();
                if (urlText) {
                    urls.push(urlText);
                }
            });

            // If it's a sitemap index, fetch individual sitemaps
            if (urls.length === 0) {
                $('sitemap > loc').each((_, element) => {
                    const sitemapLoc = $(element).text().trim();
                    urls.push(sitemapLoc);
                });
                logger.debug(`Found ${urls.length} sitemap references in sitemap index`);
            } else {
                logger.debug(`Found ${urls.length} URLs in sitemap`);
            }
        } catch (error) {
            logger.error('Error fetching sitemap:', error);
            return res.status(500).json({
                error: 'Failed to fetch sitemap',
            });
        }

        const maxUrls = parseInt(process.env.MAX_URLS_TO_CRAWL || '5');
        const limitedUrls = urls.slice(0, maxUrls);

        logger.info(`Returning ${limitedUrls.length} URLs from sitemap (total: ${urls.length})`);

        return res.json({
            success: true,
            sitemapUrl,
            urls: limitedUrls,
            totalUrls: urls.length,
        });
    } catch (error) {
        logger.error('Error in sitemap extraction:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
