import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { config } from './lib/config.js';
import { createLogger, requestLogger } from './lib/logger.js';
import { crawlHandler } from './routes/crawl.js';
import { searchHandler } from './routes/search.js';
import { sitemapHandler } from './routes/sitemap.js';

const logger = createLogger('Server');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
if (config.processing.debug) {
    app.use(morgan('dev'));
}
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: config.server.nodeEnv,
    });
});

// API Routes
app.post('/api/crawl', crawlHandler);
app.post('/api/sitemap', sitemapHandler);
app.post('/api/search', searchHandler);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Documentation Indexing API',
        version: '1.0.0',
        endpoints: {
            health: 'GET /health',
            crawl: 'POST /api/crawl',
            sitemap: 'POST /api/sitemap',
            search: 'POST /api/search',
        },
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.path}`,
    });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: config.processing.debug ? err.message : 'An unexpected error occurred',
    });
});

// Start server
const PORT = config.server.port;

app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT signal received: closing HTTP server');
    process.exit(0);
});
