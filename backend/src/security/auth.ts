import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import { Session } from '../models/Session.js';

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export const requireAuth: RequestHandler = async (req, res, next) => {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization') ?? '');
  if (!match) {
    res.status(401).json({ success: false, error: 'Sign in required' });
    return;
  }
  // TTL cleanup is asynchronous: expiry must also be enforced in the query.
  const session = await Session.findOne({ tokenHash: hashToken(match[1]), expiresAt: { $gt: new Date() } });
  if (!session) {
    res.status(401).json({ success: false, error: 'Session expired or invalid' });
    return;
  }
  res.locals.userId = session.userId.toString();
  res.locals.tokenHash = session.tokenHash;
  next();
};
