import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { createProfileRouter } from '../src/routes/profile.routes.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Profile } from '../src/models/Profile.js';
import { hashToken } from '../src/security/auth.js';
import { hashPassword, verifyPassword } from '../src/security/passwords.js';
import { readData, readError, type AuthData, type SavedProfile } from './http.js';

// Real HTTP, routing, multipart parsing, password hashing and auth middleware.
// Repository doubles deliberately avoid production databases and paid AI calls.
const users: any[] = [];
const sessions: any[] = [];
const profiles: any[] = [];
const calls = { parse: 0, optimize: 0, pdf: 0, writes: 0 };
const extracted = { personalInfo: { fullName: 'Test Candidate' }, experiences: [], education: [],
  projects: [{ title: 'Portfolio', description: 'Built a test app', techStack: ['TypeScript'] }] };
let server: Server;
let base: string;
let tokenA: string;
let tokenB: string;
let profileId: string;

before(async () => {
  mock.method(User, 'create', async (data: any) => {
    if (users.some(u => u.email === data.email)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    const user = { ...data, _id: new Types.ObjectId() }; users.push(user); return user;
  });
  mock.method(User, 'findOne', (query: any) => ({ select: async () => users.find(u => u.email === query.email) ?? null }));
  mock.method(Session, 'create', async (data: any) => { sessions.push(data); return data; });
  mock.method(Session, 'findOne', async (query: any) => sessions.find(s => s.tokenHash === query.tokenHash && s.expiresAt > query.expiresAt.$gt) ?? null);
  mock.method(Session, 'deleteOne', async (query: any) => {
    const i = sessions.findIndex(s => s.tokenHash === query.tokenHash); if (i >= 0) sessions.splice(i, 1);
  });
  mock.method(Profile, 'findOne', async (query: any) => profiles.find(p => p.userId === query.userId && (!query._id || p._id === query._id)) ?? null);
  mock.method(Profile, 'create', async (data: any) => {
    calls.writes++;
    if (profiles.some(p => p.userId === data.userId)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    const profile = { ...data, _id: new Types.ObjectId().toString(), revision: 0 }; profiles.push(profile); return profile;
  });
  mock.method(Profile, 'findOneAndUpdate', async (query: any, update: any, options: any) => {
    calls.writes++;
    assert.equal(options.runValidators, true);
    assert.deepEqual(update.$unset, { rawResumeText: 1 });
    let profile = profiles.find(p => p.userId === query.userId);
    if (!profile) { profile = { _id: new Types.ObjectId().toString(), userId: query.userId }; profiles.push(profile); }
    Object.assign(profile, update.$set); return profile;
  });
  mock.method(Profile, 'deleteOne', async (query: any) => {
    const i = profiles.findIndex(p => p._id === query._id && p.userId === query.userId);
    if (i >= 0) profiles.splice(i, 1);
  });
  const app = createApp(createProfileRouter({
    parse: async () => { calls.parse++; return 'Synthetic resume text'; },
    extract: async () => extracted,
    normalize: async () => ['TypeScript'],
    optimize: async () => { calls.optimize++; return { matchScore: 0, missingHardSkills: [], missingSoftSkills: [], recommendations: [], optimizedBullets: [] }; },
    pdf: async () => { calls.pdf++; return Buffer.from('%PDF-test'); },
  }));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => { mock.restoreAll(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });

function request(path: string, method = 'GET', token?: string, body?: unknown) {
  return fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
function upload(token: string, content = '%PDF-test', extraField = false) {
  const form = new FormData(); form.append('resume', new Blob([content], { type: 'application/pdf' }), 'resume.pdf');
  if (extraField) form.append('userId', users[1]._id.toString());
  return fetch(base + '/api/profile/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
}

test('password hashes are salted and verify only the correct password', async () => {
  const a = await hashPassword('correct password'); const b = await hashPassword('correct password');
  assert.notEqual(a, b); assert.equal(await verifyPassword('correct password', a), true);
  assert.equal(await verifyPassword('wrong password', a), false); assert.equal(await verifyPassword('anything', 'malformed'), false);
});
test('every private endpoint rejects anonymous and malformed sessions before work', async () => {
  for (const [path, method] of [['', 'POST'], ['/upload', 'POST'], ['/me', 'GET'], ['/507f1f77bcf86cd799439011', 'PUT'], ['/507f1f77bcf86cd799439011/export', 'GET'], ['/507f1f77bcf86cd799439011/optimize', 'POST'], ['/507f1f77bcf86cd799439011', 'DELETE']]) {
    assert.equal((await request('/api/profile' + path, method)).status, 401);
    assert.equal((await request('/api/profile' + path, method, 'forged')).status, 401);
  }
  assert.deepEqual(calls, { parse: 0, optimize: 0, pdf: 0, writes: 0 });
});
test('registration validates credentials and creates hashed, expiring sessions', async () => {
  assert.equal((await request('/api/auth/register', 'POST', undefined, { email: {}, password: 'x' })).status, 400);
  for (const email of ['A@example.com', 'b@example.com']) {
    const response = await request('/api/auth/register', 'POST', undefined, { email, password: 'correct password' });
    assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await readData<AuthData>(response);
    assert.match(data.token, /^[a-f0-9]{64}$/);
    assert.equal(data.passwordHash, undefined);
    if (!tokenA) tokenA = data.token; else tokenB = data.token;
  }
  assert.equal(users[0].email, 'a@example.com');
  assert.notEqual(sessions[0].tokenHash, tokenA); assert.equal(sessions[0].tokenHash, hashToken(tokenA));
  assert.equal((await request('/api/auth/register', 'POST', undefined, { email: 'a@example.com', password: 'correct password' })).status, 409);
});
test('login rejects wrong credentials and issues a fresh token', async () => {
  for (const email of ['a@example.com', 'unknown@example.com']) {
    const response = await request('/api/auth/login', 'POST', undefined, { email, password: 'wrong password' });
    assert.equal(response.status, 401); assert.equal(await readError(response), 'Invalid email or password');
  }
  const response = await request('/api/auth/login', 'POST', undefined, { email: 'a@example.com', password: 'correct password' });
  assert.equal(response.status, 200); assert.notEqual((await readData<AuthData>(response)).token, tokenA);
});
test('uploads reject spoofed PDF content and supplied ownership before parsing', async () => {
  assert.equal((await upload(tokenA, 'not a PDF')).status, 400);
  assert.equal((await upload(tokenA, '%PDF-test', true)).status, 400);
  assert.equal(calls.parse, 0); assert.equal(calls.writes, 0);
});
test('oversized and additional files are rejected before parsing', async () => {
  assert.equal((await upload(tokenA, '%PDF-' + 'x'.repeat(10 * 1024 * 1024))).status, 413);
  const form = new FormData();
  for (const name of ['one.pdf', 'two.pdf']) form.append('resume', new Blob(['%PDF-test'], { type: 'application/pdf' }), name);
  const response = await fetch(base + '/api/profile/upload', { method: 'POST', headers: { Authorization: `Bearer ${tokenA}` }, body: form });
  assert.equal(response.status, 400); assert.equal(calls.parse, 0);
});
test('upload persists extracted projects for the session owner and returns no raw text', async () => {
  const response = await upload(tokenA); assert.equal(response.status, 200);
  const data = await readData<SavedProfile>(response); profileId = data.profileId;
  assert.equal(data.projects[0].title, extracted.projects[0].title);
  assert.deepEqual(profiles[0].projects[0].techStack, extracted.projects[0].techStack);
  assert.equal(profiles[0].userId, users[0]._id.toString()); assert.equal(data.rawResumeText, undefined);
  assert.equal(data.slug, undefined);
  assert.equal(await readData(await request('/api/profile/me', 'GET', tokenB)), null);
});
test('cross-user optimize/export/delete are indistinguishable from missing profiles', async () => {
  for (const [suffix, method] of [['/export', 'GET'], ['/optimize', 'POST'], ['', 'DELETE']]) {
    const response = await request(`/api/profile/${profileId}${suffix}`, method, tokenB, method === 'POST' ? { jobDescription: 'test' } : undefined);
    assert.equal(response.status, 404); assert.equal(await readError(response), 'Profile not found');
  }
  assert.equal(calls.optimize, 0); assert.equal(calls.pdf, 0); assert.equal(profiles.length, 1);
});
test('owner can export and optimize; invalid IDs and job payloads are rejected', async () => {
  assert.equal((await request('/api/profile/not-an-id/export', 'GET', tokenA)).status, 400);
  for (const jobDescription of [{ $ne: null }, ' ', 'x'.repeat(20001)]) {
    assert.equal((await request(`/api/profile/${profileId}/optimize`, 'POST', tokenA, { jobDescription })).status, 400);
  }
  const pdf = await request(`/api/profile/${profileId}/export`, 'GET', tokenA);
  assert.equal(pdf.status, 200); assert.match(pdf.headers.get('content-type')!, /application\/pdf/);
  assert.equal((await request(`/api/profile/${profileId}/optimize`, 'POST', tokenA, { jobDescription: 'TypeScript developer' })).status, 200);
  assert.equal(calls.optimize, 1); assert.equal(calls.pdf, 1);
});
test('legacy public links never read or disclose profile data', async () => {
  assert.equal((await request('/api/profile/public/legacy-link')).status, 404);
});
test('owner deletion removes the profile', async () => {
  assert.equal((await request(`/api/profile/${profileId}`, 'DELETE', tokenA)).status, 204);
  assert.equal(profiles.length, 0);
});
test('expired, unknown and logged-out sessions cannot access profiles', async () => {
  assert.equal((await request('/api/profile/me', 'GET', 'a'.repeat(64))).status, 401);
  sessions.find(s => s.tokenHash === hashToken(tokenB)).expiresAt = new Date(0);
  assert.equal((await request('/api/profile/me', 'GET', tokenB)).status, 401);
  assert.equal((await request('/api/auth/logout', 'POST', tokenA)).status, 204);
  assert.equal((await request('/api/profile/me', 'GET', tokenA)).status, 401);
});
test('errors are safe and CORS only permits the configured frontend', async () => {
  const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(response.status, 400); assert.equal(await readError(response), 'Invalid or oversized request body');
  const denied = await fetch(base + '/api/health', { headers: { Origin: 'https://untrusted.invalid' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});
