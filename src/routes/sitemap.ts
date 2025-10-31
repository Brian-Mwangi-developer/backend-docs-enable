// api/sitemap

import * as cheerio from 'cheerio';
import { Request, Response } from 'express';
import robotsParser from 'robots-parser';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('SitemapRoute');

interface SitemapRequest {
    url: string;
}

function isEnglishSitemap(sitemapUrl: string): boolean {
    const url = sitemapUrl.toLowerCase();
    return url.includes('-en') ||
        url.includes('_en') ||
        url.includes('/en/') ||
        url.includes('english') ||
        url.includes('sitemap-en.xml') ||
        url.includes('sitemap_en.xml');
}

async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
    try {
        logger.debug(`Fetching individual sitemap from ${sitemapUrl}`);
        const response = await fetch(sitemapUrl);
        const xml = await response.text();
        const $ = cheerio.load(xml, { xmlMode: true });

        const urls: string[] = [];
        $('url > loc').each((_, element) => {
            const urlText = $(element).text().trim();
            if (urlText) {
                urls.push(urlText);
            }
        });

        logger.debug(`Found ${urls.length} URLs in sitemap: ${sitemapUrl}`);
        return urls;
    } catch (error) {
        logger.warn(`Error fetching sitemap ${sitemapUrl}:`, error);
        return [];
    }
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

        const urlObj = new URL(url);
        const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
        const robotsUrl = `${baseUrl}/robots.txt`;

        let sitemapUrl: string | null = null;
        try {
            logger.debug(`Fetching robots.txt from ${robotsUrl}`);
            const robotsResponse = await fetch(robotsUrl);
            const robotsTxt = await robotsResponse.text();
            const robots = robotsParser(robotsUrl, robotsTxt);

            const sitemapMatch = robotsTxt.match(/Sitemap:\s*(.+)/i);
            if (sitemapMatch) {
                sitemapUrl = sitemapMatch[1].trim();
                logger.debug(`Found sitemap in robots.txt: ${sitemapUrl}`);
            }

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
            //continue still if no robots.txt
            sitemapUrl = `${baseUrl}/sitemap.xml`;
        }

        if (!sitemapUrl) {
            sitemapUrl = `${baseUrl}/sitemap.xml`;
        }

        let urls: string[] = [];
        let finalSitemapUrl = sitemapUrl;

        try {
            logger.debug(`Fetching sitemap from ${sitemapUrl}`);
            const sitemapResponse = await fetch(sitemapUrl);
            const sitemapXml = await sitemapResponse.text();
            const $ = cheerio.load(sitemapXml, { xmlMode: true });

            $('url > loc').each((_, element) => {
                const urlText = $(element).text().trim();
                if (urlText) {
                    urls.push(urlText);
                }
            });
            if (urls.length === 0) {
                const sitemapRefs: string[] = [];
                $('sitemap > loc').each((_, element) => {
                    const sitemapLoc = $(element).text().trim();
                    if (sitemapLoc) {
                        sitemapRefs.push(sitemapLoc);
                    }
                });

                logger.debug(`Found ${sitemapRefs.length} sitemap references in sitemap index`);

                if (sitemapRefs.length > 0) {
                    let englishSitemap = sitemapRefs.find(isEnglishSitemap);

                    if (englishSitemap) {
                        logger.info(`Found English sitemap: ${englishSitemap}`);
                        finalSitemapUrl = englishSitemap;
                        urls = await fetchSitemapUrls(englishSitemap);
                    } else {
                        logger.info('No English sitemap found, trying first available sitemap');
                        const maxSitemapsToTry = 3;

                        for (let i = 0; i < Math.min(sitemapRefs.length, maxSitemapsToTry); i++) {
                            const currentSitemap = sitemapRefs[i];
                            const currentUrls = await fetchSitemapUrls(currentSitemap);

                            if (currentUrls.length > 0) {
                                urls = currentUrls;
                                finalSitemapUrl = currentSitemap;
                                logger.info(`Using sitemap: ${currentSitemap} with ${currentUrls.length} URLs`);
                                break;
                            }
                        }
                    }
                }
            } else {
                logger.debug(`Found ${urls.length} URLs in main sitemap`);
            }
        } catch (error) {
            logger.error('Error fetching sitemap:', error);
            return res.status(500).json({
                error: 'Failed to fetch sitemap',
            });
        }

        if (urls.length === 0) {
            logger.warn('No URLs found in any sitemap');
            return res.status(404).json({
                error: 'No URLs found in sitemap',
            });
        }

        const maxUrls = parseInt(process.env.MAX_URLS_TO_CRAWL || '45');
        const limitedUrls = urls.slice(0, maxUrls);

        logger.info(`Returning ${limitedUrls.length} URLs from sitemap (total: ${urls.length})`);

        return res.json({
            success: true,
            sitemapUrl: finalSitemapUrl,
            urls: limitedUrls,
            totalUrls: urls.length,
            isEnglishSitemap: isEnglishSitemap(finalSitemapUrl),
        });
    } catch (error) {
        logger.error('Error in sitemap extraction:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}