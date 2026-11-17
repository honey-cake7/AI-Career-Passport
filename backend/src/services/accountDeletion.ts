import { User } from '../models/User.js';
import { Profile } from '../models/Profile.js';
import { Session } from '../models/Session.js';
import { verifyPassword } from '../security/passwords.js';
import { AccountUnavailableError, withAccountLock } from '../security/accountAccess.js';
import { inputObject, ResumeInputError } from '../validation/resume.js';

export function parseDeletionRequest(value: unknown) {
  const input = inputObject(value, ['password', 'confirmation'], 'Account deletion');
  // Password whitespace is meaningful; do not use the trimming text validator.
  if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128) throw new ResumeInputError('Enter your current password of 12–128 characters.');
  if (input.confirmation !== 'DELETE') throw new ResumeInputError('Type DELETE to confirm permanent account deletion.');
  return { password: input.password };
}

async function purgeMarkedAccount(userId: string) {
  if (!await User.exists({ _id: userId, deletionRequestedAt: { $exists: true } })) return;
  // Keep the durable access barrier until every dependent collection is purged.
  // Each operation is idempotent, so a crash/failure can resume on standalone Mongo.
  await Profile.deleteMany({ userId }); // Embedded job versions, reviews and plans too.
  await Session.deleteMany({ userId });
  await User.deleteOne({ _id: userId, deletionRequestedAt: { $exists: true } });
}

export async function requestAccountDeletion(userId: string, password: string): Promise<'deleted' | 'pending' | 'wrong_password'> {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw new AccountUnavailableError();
  if (!await verifyPassword(password, user.passwordHash)) return 'wrong_password';
  return withAccountLock(userId, async () => {
    // A competing, password-confirmed deletion may have completed while waiting.
    if (!await User.exists({ _id: userId })) return 'deleted';
    await User.updateOne({ _id: userId, deletionRequestedAt: { $exists: false } }, { $set: { deletionRequestedAt: new Date() } });
    try { await purgeMarkedAccount(userId); return 'deleted'; }
    catch { console.error('account_deletion_pending'); return 'pending'; }
  });
}

export async function recoverPendingDeletions() {
  const pending = await User.find({ deletionRequestedAt: { $exists: true } }).select('_id').limit(20).lean();
  let completed = 0;
  for (const user of pending) {
    try { await withAccountLock(user._id.toString(), () => purgeMarkedAccount(user._id.toString())); completed++; }
    catch { console.error('account_deletion_recovery_pending'); }
  }
  return completed;
}

export function startDeletionRecovery() {
  let running = false;
  let stopped = false;
  const run = async () => {
    if (running || stopped) return;
    running = true;
    try { await recoverPendingDeletions(); }
    catch { console.error('account_deletion_recovery_unavailable'); }
    finally { running = false; }
  };
  void run();
  const timer = setInterval(() => void run(), 60_000);
  timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}
