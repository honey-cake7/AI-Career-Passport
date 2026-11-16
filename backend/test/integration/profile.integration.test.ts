import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { createApp } from '../../src/app.js';
import { createProfileRouter } from '../../src/routes/profile.routes.js';
import { Profile } from '../../src/models/Profile.js';
import { User } from '../../src/models/User.js';
import { Session } from '../../src/models/Session.js';
import { hashToken } from '../../src/security/auth.js';
import { generateProfilePdf } from '../../src/services/pdfGenerator.service.js';
import { extractTextFromPdf } from '../../src/services/pdfParser.service.js';
import { readData, readError, type AuthData, type SavedProfile } from '../http.js';

let mongo: MongoMemoryServer;
let server: Server;
let base: string;
let tokenA: string;
let tokenB: string;
let profileId: string;
let resume: Buffer;
let optimizationCalls = 0;
const extracted = { personalInfo: { fullName: 'Synthetic Candidate', email: 'resume@example.invalid' },
  experiences: [], education: [], projects: [{ title: 'Evidence Portfolio', description: 'Built a TypeScript project.', techStack: ['TypeScript'] }] };

before(async () => {
  // This URI is generated here: production MONGODB_URI and credentials are never used.
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'passport_security_test' });
  await Promise.all([User.init(), Session.init(), Profile.init()]);
  resume = await generateProfilePdf(new Profile({ userId: new mongoose.Types.ObjectId(), ...extracted, skills: ['TypeScript'] }));
  const app = createApp(createProfileRouter({
    parse: extractTextFromPdf,
    extract: async () => extracted,
    normalize: async () => ['TypeScript'],
    optimize: async () => { optimizationCalls++; return { matchScore: 0, missingHardSkills: [], missingSoftSkills: [], recommendations: [], optimizedBullets: [] }; },
    pdf: generateProfilePdf,
  }));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}, { timeout: 300000 });

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

function request(path: string, method = 'GET', token?: string, body?: object) {
  return fetch(base + path, { method, headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
  }, body: body ? JSON.stringify(body) : undefined });
}

test('real Mongo accounts enforce unique email, hide hashes, and store session hashes', async () => {
  for (const email of ['owner@example.invalid', 'other@example.invalid']) {
    const response = await request('/api/auth/register', 'POST', undefined, { email, password: 'synthetic password' });
    assert.equal(response.status, 201);
    const data = await readData<AuthData>(response);
    if (!tokenA) tokenA = data.token; else tokenB = data.token;
  }
  assert.equal((await request('/api/auth/register', 'POST', undefined, { email: 'owner@example.invalid', password: 'synthetic password' })).status, 409);
  assert.equal((await User.findOne({ email: 'owner@example.invalid' }))?.passwordHash, undefined);
  const stored = await Session.findOne({ tokenHash: hashToken(tokenA) });
  assert.ok(stored); assert.notEqual(stored.tokenHash, tokenA);
  assert.ok(Session.schema.indexes().some(([index, options]) => index.expiresAt === 1 && options.expireAfterSeconds === 0));
});

test('real PDF upload stores projects, omits raw text, and survives sign-in reload', async () => {
  const form = new FormData();
  form.append('resume', new Blob([new Uint8Array(resume)], { type: 'application/pdf' }), 'synthetic.pdf');
  const response = await fetch(base + '/api/profile/upload', { method: 'POST', headers: { Authorization: `Bearer ${tokenA}` }, body: form });
  assert.equal(response.status, 200);
  const data = await readData<SavedProfile>(response); profileId = data.profileId;
  assert.equal(data.projects[0].title, 'Evidence Portfolio');
  const stored = await Profile.findById(profileId).select('+rawResumeText');
  assert.ok(stored); assert.equal(stored.projects[0].techStack[0], 'TypeScript');
  assert.equal(stored.rawResumeText, undefined);
  assert.equal(stored.userId.toString(), (await User.findOne({ email: 'owner@example.invalid' }))?._id.toString());
  const login = await request('/api/auth/login', 'POST', undefined, { email: 'owner@example.invalid', password: 'synthetic password' });
  assert.equal(login.status, 200); tokenA = (await readData<AuthData>(login)).token;
  const loaded = await readData<SavedProfile>(await request('/api/profile/me', 'GET', tokenA));
  assert.equal(loaded.projects[0].title, 'Evidence Portfolio');
  assert.equal(loaded.rawResumeText, undefined); assert.equal(loaded.userId, undefined);
});

test('real Mongo filters block another user from export, optimization and deletion', async () => {
  for (const [suffix, method] of [['/export', 'GET'], ['/optimize', 'POST'], ['', 'DELETE']]) {
    assert.equal((await request(`/api/profile/${profileId}${suffix}`, method, tokenB, method === 'POST' ? { jobDescription: 'TypeScript' } : undefined)).status, 404);
  }
  assert.equal(optimizationCalls, 0); assert.equal(await Profile.countDocuments(), 1);
  assert.equal(await readData(await request('/api/profile/me', 'GET', tokenB)), null);
  const profile = await Profile.findById(profileId); assert.ok(profile);
  assert.equal((await request(`/api/profile/public/${profile.slug}`)).status, 404);
});

test('owner export produces a parseable PDF including persisted projects', async () => {
  const response = await request(`/api/profile/${profileId}/export`, 'GET', tokenA);
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type')!, /application\/pdf/);
  const text = await extractTextFromPdf(Buffer.from(await response.arrayBuffer()));
  assert.match(text, /Synthetic Candidate/); assert.match(text, /Evidence Portfolio/); assert.match(text, /TypeScript/);
});

test('re-upload unsets legacy raw text and updates the same owner document', async () => {
  await Profile.updateOne({ _id: profileId }, { $set: { rawResumeText: 'synthetic legacy retained text' } });
  const form = new FormData(); form.append('resume', new Blob([new Uint8Array(resume)], { type: 'application/pdf' }), 'synthetic.pdf');
  const response = await fetch(base + '/api/profile/upload', { method: 'POST', headers: { Authorization: `Bearer ${tokenA}` }, body: form });
  assert.equal(response.status, 200); assert.equal((await readData<SavedProfile>(response)).profileId, profileId);
  assert.equal(await Profile.countDocuments(), 1);
  assert.equal((await Profile.findById(profileId).select('+rawResumeText'))?.rawResumeText, undefined);
});

test('corrupt PDF with a valid signature fails safely without overwriting the saved profile', async () => {
  const form = new FormData(); form.append('resume', new Blob(['%PDF-invalid'], { type: 'application/pdf' }), 'broken.pdf');
  const response = await fetch(base + '/api/profile/upload', { method: 'POST', headers: { Authorization: `Bearer ${tokenA}` }, body: form });
  assert.equal(response.status, 422);
  assert.equal(await readError(response), 'Unable to read PDF text. Upload a readable text-based PDF.');
  assert.equal((await Profile.findById(profileId))?.projects[0].title, 'Evidence Portfolio');
});

test('explicit expiry denies access before TTL cleanup; logout revokes the token', async () => {
  await Session.updateOne({ tokenHash: hashToken(tokenB) }, { $set: { expiresAt: new Date(0) } });
  assert.equal((await request('/api/profile/me', 'GET', tokenB)).status, 401);
  assert.equal((await request('/api/auth/logout', 'POST', tokenA)).status, 204);
  assert.equal(await Session.countDocuments({ tokenHash: hashToken(tokenA) }), 0);
  assert.equal((await request('/api/profile/me', 'GET', tokenA)).status, 401);
});

test('owner deletion removes the real Mongo profile and its private fields', async () => {
  const login = await request('/api/auth/login', 'POST', undefined, { email: 'owner@example.invalid', password: 'synthetic password' });
  tokenA = (await readData<AuthData>(login)).token;
  assert.equal((await request(`/api/profile/${profileId}`, 'DELETE', tokenA)).status, 204);
  assert.equal(await Profile.countDocuments(), 0);
});
