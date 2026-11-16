import express from 'express';
import cors from 'cors';
import multer from 'multer';
import profileRoutes from './routes/profile.routes.js';
import authRoutes from './routes/auth.routes.js';
import { rateLimit } from './security/rateLimit.js';
import { SkillPipelineError } from './utils/skillPipeline.js';

export function createApp(profileRouter = profileRoutes) {
  const app = express();
  app.disable('x-powered-by');
  const allowedOrigins = process.env.FRONTEND_URL
    ? [new URL(process.env.FRONTEND_URL).origin]
    : process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173'];
  app.use(cors({ origin: allowedOrigins, allowedHeaders: ['Content-Type', 'Authorization'] }));
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use('/api', rateLimit(200, 60 * 1000));
  app.use(express.json({ limit: '256kb' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRouter);
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use((_req, res) => { res.status(404).json({ success: false, error: 'Route not found' }); });
  app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof SkillPipelineError) {
      res.status(503).json({ success: false, error: err.message }); return;
    }
    if (err instanceof multer.MulterError) {
      res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        success: false, error: 'Upload one PDF up to 10 MB; additional fields are not accepted',
      });
      return;
    }
    if (err.status === 400 || err.status === 413) {
      res.status(err.status).json({ success: false, error: 'Invalid or oversized request body' });
      return;
    }
    console.error('request_failed');
    res.status(500).json({ success: false, error: 'Unable to complete request. Please try again.' });
  });
  return app;
}
export default createApp();
