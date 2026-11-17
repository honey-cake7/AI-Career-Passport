import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { createApp } from '../../src/app.js';
import { createProfileRouter } from '../../src/routes/profile.routes.js';
import { createVersionRouter } from '../../src/routes/version.routes.js';
import { Profile } from '../../src/models/Profile.js';
import { User } from '../../src/models/User.js';
import { Session } from '../../src/models/Session.js';
import { parseJobReviewOutput, type JobReview } from '../../src/services/jobReview.js';
import { focusSuggestions } from '../../src/services/jobReviewProvider.js';
import { JobReviewError } from '../../src/services/jobReviewError.js';
import { extractTextFromPdf } from '../../src/services/pdfParser.service.js';
import { readData, type AuthData } from '../http.js';

let mongo: MongoMemoryServer;
let server: Server;
let base: string;
let a: string;
let b: string;
let profileId: string;
let otherProfileId: string;
let versionId: string;
let calls = 0;
let failure = false;
let oversized = false;
let gate: { entered: () => void; wait: Promise<void> } | null = null;
const jd = 'React and Docker are required.';
const content = { personalInfo: { fullName: 'Synthetic Candidate' }, skills: ['Docker'], experiences: [], education: [],
  projects: [{ title: 'UI Portfolio', techStack: ['React'], description: 'Wrote tests for a parser.\nBuilt a React interface.' }] };
const modelOutput = { requirements: [
  { label: 'React', quote: jd, kind: 'skill', term: 'React', priority: 'required' },
  { label: 'Docker', quote: jd, kind: 'skill', term: 'Docker', priority: 'required' },
], suggestions: [] };
type VersionData = typeof content & { profileId: string; revision: number; label: string; analysis: JobReview | null; userId?: unknown };

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'versions_isolated_test' });
  await Promise.all([User.init(), Session.init(), Profile.init()]);
  const versions = createVersionRouter({ review: async (resume, job, revision) => {
    calls++;
    if (gate) { gate.entered(); await gate.wait; }
    if (failure) throw new JobReviewError('invalid_output');
    const parsed = parseJobReviewOutput(modelOutput, job, resume);
    return { ...parsed, suggestions: focusSuggestions(resume, parsed.requirements), schemaVersion: 1, revision, generatedAt: oversized ? '測'.repeat(200000) : new Date().toISOString(), usage: { model: 'synthetic', inputTokens: 100, outputTokens: 50 } };
  } });
  server = createApp(createProfileRouter(undefined, versions)).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}, { timeout: 300000 });
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await mongoose.disconnect(); if (mongo) await mongo.stop();
});
function request(path: string, method = 'GET', token?: string, body?: object) {
  const payload = method === 'GET' ? undefined : body;
  return fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(payload ? { 'Content-Type': 'application/json' } : {}) }, body: payload ? JSON.stringify(payload) : undefined });
}
const root = () => `/api/profile/${profileId}/versions`;
const path = () => `${root()}/${versionId}`;

test('create synthetic owners and base resumes with real sessions and MongoDB', async () => {
  for (const email of ['versions-owner@example.invalid', 'versions-other@example.invalid']) {
    const response = await request('/api/auth/register', 'POST', undefined, { email, password: 'synthetic password' });
    assert.equal(response.status, 201); const token = (await readData<AuthData>(response)).token;
    if (!a) a = token; else b = token;
    const created = await request('/api/profile', 'POST', token, content);
    assert.equal(created.status, 201); const data = await readData<VersionData>(created);
    assert.equal(data.userId, undefined);
    if (!profileId) profileId = data.profileId; else otherProfileId = data.profileId;
  }
});

test('version creation validates input and copies the saved base without changing it', async () => {
  await Profile.updateOne({ _id: profileId }, { $unset: { versions: 1, revision: 1 } }); // Legacy profiles need no bulk migration.
  for (const body of [{ label: 'Role', jobDescription: jd, revision: 0, userId: otherProfileId },
    { label: 'Role', jobDescription: '', revision: 0 }, { label: 'Role', jobDescription: jd, revision: '0' }]) {
    assert.equal((await request(root(), 'POST', a, body)).status, 400);
  }
  assert.equal((await request(root(), 'POST', a, { label: 'Role', jobDescription: jd, revision: 9 })).status, 409);
  const response = await request(root(), 'POST', a, { label: 'Frontend role', jobDescription: jd, revision: 0 });
  assert.equal(response.status, 201);
  const v = await readData<VersionData>(response); versionId = v.profileId;
  assert.equal(v.revision, 0); assert.equal(v.projects[0]!.description, content.projects[0]!.description);
  const stored = await Profile.findById(profileId); assert.equal(stored?.revision, 0); assert.equal(stored?.versions, undefined);
  const own = await readData<Record<string, unknown>>(await request('/api/profile/me', 'GET', a));
  assert.equal(own.versions, undefined); assert.equal(calls, 0);
});

test('anonymous, foreign parent, and foreign-version operations cause no provider calls or disclosure', async () => {
  for (const [suffix, method] of [['', 'GET'], ['', 'POST'], [`/${versionId}`, 'GET'], [`/${versionId}`, 'PUT'], [`/${versionId}`, 'DELETE'], [`/${versionId}/review`, 'POST'], [`/${versionId}/export?revision=0`, 'GET']]) {
    assert.equal((await request(root() + suffix, method)).status, 401);
    assert.equal((await request(root() + suffix, method, b, { revision: 0 })).status, 404);
  }
  for (const [suffix, method] of [['', 'GET'], ['', 'PUT'], ['', 'DELETE'], ['/review', 'POST'], ['/export?revision=0', 'GET']]) {
    assert.equal((await request(`/api/profile/${otherProfileId}/versions/${versionId}${suffix}`, method, b, { revision: 0 })).status, 404);
  }
  assert.equal(calls, 0);
});

test('tailored edits persist separately, reject stale writes and export only the saved version', async () => {
  const changed = { ...content, personalInfo: { fullName: 'Synthetic Candidate', summary: 'Version-specific summary.' } };
  const responses = await Promise.all([request(path(), 'PUT', a, { revision: 0, content: changed }), request(path(), 'PUT', a, { revision: 0, content: changed })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const current = await readData<VersionData>(await request(path(), 'GET', a));
  assert.equal(current.revision, 1); assert.equal(current.projects[0]!.title, 'UI Portfolio');
  assert.equal((await Profile.findById(profileId))?.personalInfo.summary, '');
  assert.equal((await request(path(), 'PUT', a, { revision: 1, content: { ...changed, owner: 'forged' } })).status, 400);
  assert.equal((await request(path() + '/export?revision=0', 'GET', a)).status, 409);
  const pdf = await request(path() + '/export?revision=1', 'GET', a); assert.equal(pdf.status, 200);
  const text = await extractTextFromPdf(Buffer.from(await pdf.arrayBuffer())); assert.ok(text.includes('Version-specific summary.'));
});

test('verified reviews persist and repeat requests use the saved revision cache', async () => {
  const response = await request(path() + '/review', 'POST', a, { revision: 1 });
  assert.equal(response.status, 200);
  const review = await readData<JobReview>(response);
  assert.deepEqual(review.requirements.map(r => r.status), ['work_mention', 'claim_only']);
  assert.equal(review.suggestions.length, 1); assert.equal(calls, 1);
  assert.equal((await request(path() + '/review', 'POST', a, { revision: 1 })).status, 200); assert.equal(calls, 1);
  const loaded = await readData<VersionData>(await request(path(), 'GET', a));
  assert.equal(loaded.analysis?.revision, 1);
  assert.equal(loaded.projects[0]!.description, content.projects[0]!.description); // No automatic proposal application.
});

test('saving reassesses locally; uncached concurrent AI work is refused and stale results cannot be saved', async () => {
  assert.equal((await request(path(), 'PUT', a, { revision: 1, content })).status, 200);
  const current = await readData<VersionData>(await request(path(), 'GET', a));
  assert.equal(current.analysis?.revision, 2); assert.equal(calls, 1);
  assert.equal((await request(path() + '/review', 'POST', a, { revision: 2 })).status, 200); assert.equal(calls, 1);
  // Exercise a first/uncached review independently of the local reassessment cache.
  await Profile.updateOne({ _id: profileId, 'versions._id': versionId }, { $unset: { 'versions.$.analysis': 1 } });
  let entered!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  gate = { entered, wait: new Promise<void>(resolve => { release = resolve; }) };
  const pending = request(path() + '/review', 'POST', a, { revision: 2 });
  await started;
  try {
    assert.equal((await request(path() + '/review', 'POST', a, { revision: 2 })).status, 429);
    assert.equal((await request(path(), 'PUT', a, { revision: 2, content })).status, 200);
  } finally { release(); gate = null; }
  assert.equal((await pending).status, 409);
  const loaded = await readData<VersionData>(await request(path(), 'GET', a));
  assert.equal(loaded.revision, 3); assert.equal(loaded.analysis, null);
});

test('invalid AI output leaves no partial review and a later request can recover', async () => {
  failure = true;
  const failed = await request(path() + '/review', 'POST', a, { revision: 3 });
  assert.equal(failed.status, 503);
  const body = await failed.json(); assert.ok(body && typeof body === 'object' && 'code' in body); assert.equal(body.code, 'invalid_output');
  assert.equal((await readData<VersionData>(await request(path(), 'GET', a))).analysis, null);
  failure = false;
  oversized = true;
  assert.equal((await request(path() + '/review', 'POST', a, { revision: 3 })).status, 503);
  assert.equal((await readData<VersionData>(await request(path(), 'GET', a))).analysis, null);
  oversized = false;
  assert.equal((await request(path() + '/review', 'POST', a, { revision: 3 })).status, 200);
});

test('unconfigured AI returns a safe actionable error without preventing manual editing', async () => {
  assert.equal((await request(path(), 'PUT', a, { revision: 3, content })).status, 200);
  await Profile.updateOne({ _id: profileId, 'versions._id': versionId }, { $unset: { 'versions.$.analysis': 1 } });
  const previous = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  const standalone = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => standalone.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${(standalone.address() as { port: number }).port}`;
    const response = await fetch(url + path() + '/review', { method: 'POST', headers: { Authorization: `Bearer ${a}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 4 }) });
    assert.equal(response.status, 503);
    const error = await response.json(); assert.ok(error && typeof error === 'object' && 'code' in error); assert.equal(error.code, 'authentication');
    assert.equal((await readData<VersionData>(await request(path(), 'GET', a))).analysis, null);
    assert.equal((await request(path(), 'PUT', a, { revision: 4, content })).status, 200);
  } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = previous;
    await new Promise<void>(resolve => standalone.close(() => resolve()));
  }
});

test('version limits hold under concurrency; version and base deletion remove private copies', async () => {
  const responses = await Promise.all(Array.from({ length: 21 }, (_, i) => request(root(), 'POST', a, { label: `Role ${i}`, jobDescription: jd, revision: 0 })));
  assert.equal(responses.filter(r => r.status === 201).length, 19);
  assert.equal(responses.filter(r => r.status === 409).length, 2);
  const list = await readData<{ profileId: string; content?: unknown; jobDescription?: unknown }[]>(await request(root(), 'GET', a));
  assert.equal(list.length, 20); assert.equal(list[0]!.content, undefined); assert.equal(list[0]!.jobDescription, undefined);
  assert.equal((await request(path(), 'DELETE', a)).status, 204);
  assert.equal((await request(path(), 'GET', a)).status, 404);
  assert.ok(await Profile.findById(profileId));
  assert.equal((await request(`/api/profile/${profileId}`, 'DELETE', a)).status, 204);
  assert.equal(await Profile.countDocuments({ _id: profileId }), 0);
  assert.ok(await Profile.findById(otherProfileId));
});
