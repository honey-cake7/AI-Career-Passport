import assert from 'node:assert/strict';
import type { IProject } from '../src/models/Profile.js';

export interface AuthData { token: string; passwordHash?: unknown }
export interface SavedProfile {
  profileId: string;
  revision: number;
  projects: IProject[];
  rawResumeText?: unknown;
  userId?: unknown;
  slug?: unknown;
}

// Assert the envelope, then let each test check its specific response contract.
export async function readData<T>(response: Response): Promise<T> {
  const body = await response.json();
  assert.ok(body && typeof body === 'object' && 'data' in body);
  return body.data as T;
}

export async function readError(response: Response): Promise<string> {
  const body = await response.json();
  assert.ok(body && typeof body === 'object' && 'error' in body);
  assert.equal(typeof body.error, 'string');
  return body.error as string;
}
