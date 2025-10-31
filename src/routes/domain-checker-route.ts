import { Request, Response } from 'express';
import { createLogger } from '../lib/logger.js';
import { checkDomainExists, getUserDomains, addUserToDomain } from '../lib/pinecone.js';

const logger = createLogger('DomainCheckRoute');

interface DomainCheckQuery {
    url?: string;
    domain?: string;
    userEmail?: string;
}

export async function domainCheckHandler(req: Request, res: Response) {
    try {
        const { url, domain, userEmail } = req.query as DomainCheckQuery;

        if (!url && !domain) {
            logger.warn('Invalid request: URL or domain is required');
            return res.status(400).json({
                error: 'Either URL or domain parameter is required',
            });
        }

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

        let targetDomain: string;

        if (url) {
            try {
                const urlObj = new URL(url);
                targetDomain = urlObj.hostname;
            } catch (error) {
                logger.warn(`Invalid URL format: ${url}`);
                sendProgress({
                    type: 'error',
                    message: 'Invalid URL format',
                    error: `Invalid URL: ${url}`
                });
                res.end();
                return;
            }
        } else {
            targetDomain = domain!;
        }

        sendProgress({
            type: 'start',
            message: `Checking domain: ${targetDomain}`,
            domain: targetDomain
        });

        logger.info(`Checking if domain is indexed: ${targetDomain}`);

        sendProgress({
            type: 'checking_global',
            message: 'Checking if domain is indexed globally...',
            domain: targetDomain
        });

        const isIndexed = await checkDomainExists(url || `https://${domain}`);

        if (!isIndexed) {
            sendProgress({
                type: 'complete',
                domain: targetDomain,
                isIndexed: false,
                status: 'Domain Not Indexed',
                message: `The domain "${targetDomain}" has not been indexed yet. You can crawl it to make it searchable.`,
                userHasAccess: false,
                timestamp: new Date().toISOString()
            });
            res.end();
            return;
        }

        sendProgress({
            type: 'domain_found',
            message: `Domain "${targetDomain}" is indexed globally`,
            domain: targetDomain,
            isIndexed: true
        });

        if (!userEmail) {
            sendProgress({
                type: 'complete',
                domain: targetDomain,
                isIndexed: true,
                status: 'Domain Already Indexed',
                message: `The domain "${targetDomain}" has been previously indexed.`,
                timestamp: new Date().toISOString()
            });
            res.end();
            return;
        }

        sendProgress({
            type: 'checking_user_access',
            message: `Checking if user "${userEmail}" has access to domain...`,
            domain: targetDomain,
            userEmail
        });

        const userDomains = await getUserDomains(userEmail);
        const userHasAccess = userDomains.includes(targetDomain);

        if (userHasAccess) {
            sendProgress({
                type: 'complete',
                domain: targetDomain,
                isIndexed: true,
                status: 'Domain Already Indexed',
                message: `The domain "${targetDomain}" has been previously indexed.`,
                userEmail,
                userHasAccess: true,
                userAccessMessage: `User "${userEmail}" already has access to this domain.`,
                totalUserDomains: userDomains.length,
                timestamp: new Date().toISOString()
            });
            res.end();
            return;
        }

        sendProgress({
            type: 'adding_user',
            message: `Adding user "${userEmail}" to existing domain "${targetDomain}"...`,
            domain: targetDomain,
            userEmail
        });

        try {
            const addUserResult = await addUserToDomain(userEmail, targetDomain);

            sendProgress({
                type: 'user_added',
                message: `Successfully added user to domain. Updated ${addUserResult.vectorsUpdated} vectors.`,
                domain: targetDomain,
                userEmail,
                vectorsUpdated: addUserResult.vectorsUpdated
            });

            sendProgress({
                type: 'complete',
                domain: targetDomain,
                isIndexed: true,
                status: 'Domain Already Indexed - User Added',
                message: `The domain "${targetDomain}" was already indexed. User "${userEmail}" has been granted access.`,
                userEmail,
                userHasAccess: true,
                userAccessMessage: `User "${userEmail}" now has access to this domain.`,
                vectorsUpdated: addUserResult.vectorsUpdated,
                totalUserDomains: userDomains.length + 1,
                timestamp: new Date().toISOString()
            });

        } catch (addUserError) {
            logger.error('Error adding user to domain:', addUserError);
            sendProgress({
                type: 'error',
                message: `Failed to add user to domain: ${addUserError instanceof Error ? addUserError.message : 'Unknown error'}`,
                domain: targetDomain,
                userEmail,
                error: addUserError instanceof Error ? addUserError.message : 'Unknown error'
            });
        }

        res.end();

    } catch (error) {
        logger.error('Error in domain check:', error);

        if (res.headersSent) {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                message: 'Internal server error occurred',
                error: error instanceof Error ? error.message : 'Unknown error'
            })}\n\n`);
            res.end();
        } else {
            res.status(500).json({
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
}