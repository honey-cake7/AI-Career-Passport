import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { hashPassword, verifyPassword } from '../security/passwords.js';
import { hashToken, requireAuth } from '../security/auth.js';
import { rateLimit } from '../security/rateLimit.js';

const router = Router();
const credentialLimit = rateLimit(20, 15 * 60 * 1000);
// Equal-cost comparison for unknown users, without a database lookup revealing existence.
const dummyHash = hashPassword(randomBytes(32).toString('hex'));

for (const action of ['register', 'login'] as const) {
  router.post(`/${action}`, credentialLimit, async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email.trim()) ||
        typeof password !== 'string' || password.length < 12 || password.length > 128) {
      res.status(400).json({ success: false, error: 'Provide a valid email and a password of 12–128 characters' });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    let user;
    if (action === 'register') {
      try {
        user = await User.create({ email: normalizedEmail, passwordHash: await hashPassword(password) });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        res.status(409).json({ success: false, error: 'Unable to create account with these details' });
        return;
      }
    } else {
      user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
      const valid = await verifyPassword(password, user?.passwordHash ?? await dummyHash);
      if (!user || !valid) {
        res.status(401).json({ success: false, error: 'Invalid email or password' });
        return;
      }
    }
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await Session.create({ userId: user._id, tokenHash: hashToken(token), expiresAt });
    res.status(action === 'register' ? 201 : 200).json({ success: true, data: { token, expiresAt, email: user.email } });
  });
}

router.post('/logout', requireAuth, async (_req, res) => {
  await Session.deleteOne({ tokenHash: res.locals.tokenHash });
  res.sendStatus(204);
});

export default router;
