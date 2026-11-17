import { User } from '../models/User.js';

export class AccountUnavailableError extends Error {
  constructor() { super('Account is unavailable. Sign in again.'); }
}

// Serializes root-record creation and deletion for one account in this API
// process. Do not run multiple API processes until a database-wide fence exists.
const locks = new Map<string, Promise<void>>();
export async function withAccountLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  locks.set(userId, gate);
  await previous;
  try { return await operation(); }
  finally { release(); if (locks.get(userId) === gate) locks.delete(userId); }
}

export async function withActiveAccount<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  return withAccountLock(userId, async () => {
    if (!await User.exists({ _id: userId, deletionRequestedAt: { $exists: false } })) throw new AccountUnavailableError();
    return operation();
  });
}
