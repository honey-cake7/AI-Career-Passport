import type { RequestHandler } from 'express';

// Single-process protection. A shared store is required before horizontal scaling.
export function rateLimit(limit: number, windowMs: number): RequestHandler {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
    const key = res.locals.userId ?? req.ip ?? 'unknown';
    let bucket = buckets.get(key);
    if (!bucket && buckets.size >= 10000) {
      res.status(503).json({ success: false, error: 'Please try again later' });
      return;
    }
    if (!bucket) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' });
      return;
    }
    next();
  };
}
