import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { createApp } from '../../src/app.js';
import { createProfileRouter } from '../../src/routes/profile.routes.js';
import { User } from '../../src/models/User.js';
import { Profile } from '../../src/models/Profile.js';
import { Session } from '../../src/models/Session.js';
import { recoverPendingDeletions } from '../../src/services/accountDeletion.js';
import { withActiveAccount, AccountUnavailableError } from '../../src/security/accountAccess.js';
import { createGapPlan } from '../../src/services/gapPlans.js';
import { readData, type AuthData } from '../http.js';

let mongo: MongoMemoryServer; let server: Server; let base: string;
let owner: Owner; let other: Owner; let secondSession: string;
const password = 'synthetic account password';
const content = { personalInfo: { fullName: 'Synthetic Candidate' }, experiences: [], education: [], projects: [], skills: [] };
type Owner = { id: string; email: string; token: string };
let gate: { entered: () => void; wait: Promise<void> } | null = null;
function request(path: string, method = 'GET', token?: string, payload?: object) {
  return fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(payload ? { 'Content-Type': 'application/json' } : {}) }, body: payload ? JSON.stringify(payload) : undefined });
}
async function register(name: string): Promise<Owner> {
  const email = `${name}@example.invalid`;
  const response = await request('/api/auth/register', 'POST', undefined, { email, password }); assert.equal(response.status, 201);
  const auth = await readData<AuthData>(response); const user = await User.findOne({ email }); assert.ok(user);
  return { email, id: user._id.toString(), token: auth.token };
}
const remove = (token?: string, payload: object = { password, confirmation: 'DELETE' }) => request('/api/auth/account', 'DELETE', token, payload);
async function login(email: string) { return request('/api/auth/login', 'POST', undefined, { email, password }); }
before(async () => {
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri(), { dbName: 'account_deletion_isolated_test' });
  await Promise.all([User.init(), Profile.init(), Session.init()]);
  server = createApp(createProfileRouter({ parse: async () => 'Synthetic resume', extract: async () => {
    if (gate) { gate.entered(); await gate.wait; }
    return content;
  }, normalize: async () => [], pdf: async () => Buffer.from('%PDF-fixture') })).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  owner = await register('deletion-owner'); other = await register('deletion-other');
  const signedIn = await login(owner.email); assert.equal(signedIn.status, 200); secondSession = (await readData<AuthData>(signedIn)).token;
  for (const account of [owner, other]) assert.equal((await request('/api/profile', 'POST', account.token, content)).status, 201);
  const profile = await Profile.findOne({ userId: owner.id }); assert.ok(profile);
  const plan = createGapPlan({ id: 'requirement:0', label: 'Docker', term: 'Docker', quote: 'Docker is required.', kind: 'skill', priority: 'required' }, 'needs_practice', content, 0);
  await Profile.updateOne({ _id: profile._id }, { $push: { versions: { _id: new mongoose.Types.ObjectId(), label: 'Synthetic job', jobDescription: 'Docker is required.', content, revision: 0, baseRevision: 0, gapPlans: [plan] } } });
}, { timeout: 300000 });
after(async () => {
  mock.restoreAll(); if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await mongoose.disconnect(); if (mongo) await mongo.stop();
});

test('account deletion requires an active session, exact confirmation and a current password; owner injection fails', async () => {
  assert.equal((await remove()).status, 401);
  assert.equal((await remove('a'.repeat(64))).status, 401);
  assert.equal((await remove(owner.token, { password, confirmation: 'delete' })).status, 400);
  assert.equal((await remove(owner.token, { password, confirmation: 'DELETE', userId: other.id })).status, 400);
  assert.equal((await remove(owner.token, { password: 'incorrect account password', confirmation: 'DELETE' })).status, 403);
  assert.equal((await User.findById(owner.id))?.deletionRequestedAt, undefined);
  assert.equal(await Profile.countDocuments({ userId: owner.id }), 1); assert.equal(await Session.countDocuments({ userId: owner.id }), 2);
  assert.equal((await request('/api/profile/me', 'GET', owner.token)).status, 200);
});
test('confirmed deletion removes only the signed-in owner, embedded plans and every session', async () => {
  const otherProfile = await Profile.findOne({ userId: other.id }).lean(); const otherUser = await User.findById(other.id).lean();
  assert.equal((await remove(owner.token)).status, 204);
  assert.equal(await User.countDocuments({ _id: owner.id }), 0); assert.equal(await Profile.countDocuments({ userId: owner.id }), 0); assert.equal(await Session.countDocuments({ userId: owner.id }), 0);
  assert.deepEqual(await Profile.findOne({ userId: other.id }).lean(), otherProfile); assert.deepEqual(await User.findById(other.id).lean(), otherUser);
  for (const token of [owner.token, secondSession]) {
    assert.equal((await request('/api/profile/me', 'GET', token)).status, 401);
    assert.equal((await request('/api/profile', 'POST', token, content)).status, 401);
    assert.equal((await remove(token)).status, 401);
  }
  assert.equal((await login(owner.email)).status, 401);
});
test('a late upload cannot recreate a deleted profile, and the old identity cannot create sessions or profiles', async () => {
  const account = await register('late-upload');
  let entered!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  gate = { entered, wait: new Promise<void>(resolve => { release = resolve; }) };
  const form = new FormData(); form.append('resume', new Blob(['%PDF-test'], { type: 'application/pdf' }), 'synthetic.pdf');
  const upload = fetch(base + '/api/profile/upload', { method: 'POST', headers: { Authorization: `Bearer ${account.token}` }, body: form });
  await started;
  try { assert.equal((await remove(account.token)).status, 204); } finally { release(); gate = null; }
  assert.equal((await upload).status, 401); assert.equal(await Profile.countDocuments({ userId: account.id }), 0);
  await assert.rejects(withActiveAccount(account.id, () => Session.create({ userId: account.id, tokenHash: 'synthetic-late-session', expiresAt: new Date(Date.now() + 60000) })), AccountUnavailableError);
  await assert.rejects(withActiveAccount(account.id, () => Profile.create({ ...content, userId: account.id })), AccountUnavailableError);
  assert.equal(await Session.countDocuments({ userId: account.id }), 0);
});
test('failed data cleanup leaves a durable access barrier and a fresh process can finish deletion', async () => {
  const account = await register('cleanup-recovery'); await request('/api/profile', 'POST', account.token, content);
  const fail = mock.method(Profile, 'deleteMany', async () => { throw new Error('synthetic private database failure'); });
  try {
    const response = await remove(account.token); assert.equal(response.status, 202);
    const payload = await readData<{ status: string }>(response); assert.equal(payload.status, 'pending');
  } finally { fail.mock.restore(); }
  assert.ok((await User.findById(account.id))?.deletionRequestedAt); assert.equal(await Profile.countDocuments({ userId: account.id }), 1);
  assert.equal((await request('/api/profile/me', 'GET', account.token)).status, 401);
  assert.equal((await request('/api/profile', 'POST', account.token, content)).status, 401);
  assert.equal((await login(account.email)).status, 401);
  await promisify(execFile)(process.execPath, ['--import', 'tsx', '--import', './test/setup.mjs', 'test/helpers/recoverDeletion.ts'], { cwd: process.cwd(), env: { ...process.env, TEST_DELETION_MONGO_URI: mongo.getUri() }, windowsHide: true, timeout: 20000 });
  assert.equal(await User.countDocuments({ _id: account.id }), 0); assert.equal(await Profile.countDocuments({ userId: account.id }), 0); assert.equal(await Session.countDocuments({ userId: account.id }), 0);
  assert.equal(await recoverPendingDeletions(), 0); assert.equal((await request('/api/profile/me', 'GET', other.token)).status, 200);
});
test('cleanup can retry after profiles and sessions are removed but final account deletion fails', async () => {
  const account = await register('final-delete-retry'); await request('/api/profile', 'POST', account.token, content);
  const fail = mock.method(User, 'deleteOne', async () => { throw new Error('synthetic final deletion failure'); });
  try { assert.equal((await remove(account.token)).status, 202); } finally { fail.mock.restore(); }
  assert.equal(await Profile.countDocuments({ userId: account.id }), 0); assert.equal(await Session.countDocuments({ userId: account.id }), 0); assert.ok((await User.findById(account.id))?.deletionRequestedAt);
  assert.equal((await login(account.email)).status, 401);
  assert.equal(await recoverPendingDeletions(), 1); assert.equal(await User.countDocuments({ _id: account.id }), 0);
});
test('a failure before the durable marker never reports successful deletion or removes data', async () => {
  const account = await register('marker-failure'); await request('/api/profile', 'POST', account.token, content);
  const fail = mock.method(User, 'updateOne', async () => { throw new Error('synthetic marker write failed'); });
  try {
    const response = await remove(account.token); assert.equal(response.status, 500);
    assert.ok(!(await response.text()).includes('synthetic marker'));
  } finally { fail.mock.restore(); }
  assert.equal((await User.findById(account.id))?.deletionRequestedAt, undefined);
  assert.equal(await Profile.countDocuments({ userId: account.id }), 1);
  assert.equal((await request('/api/profile/me', 'GET', account.token)).status, 200);
  assert.equal((await remove(account.token)).status, 204);
});
test('confirmation attempts are throttled per account without preventing another owner from deletion', async () => {
  const account = await register('deletion-throttle');
  for (let i = 0; i < 5; i++) assert.equal((await remove(account.token, { password, confirmation: 'wrong' })).status, 400);
  const blocked = await remove(account.token); assert.equal(blocked.status, 429); assert.ok(blocked.headers.get('retry-after'));
  assert.equal((await User.findById(account.id))?.deletionRequestedAt, undefined);
  const independent = await register('deletion-independent'); assert.equal((await remove(independent.token)).status, 204);
});
test('re-registering an erased email creates a new identity with no access to the old data', async () => {
  const recreated = await register('deletion-owner'); assert.notEqual(recreated.id, owner.id);
  assert.equal(await readData(await request('/api/profile/me', 'GET', recreated.token)), null);
  assert.equal((await request('/api/profile/me', 'GET', owner.token)).status, 401);
  assert.equal((await remove(recreated.token)).status, 204);
});
