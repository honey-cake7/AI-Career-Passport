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
import { skillSnapshot, type SkillNormalization } from '../../src/services/skillReview.js';
import type { ResumeContent } from '../../src/validation/resume.js';
import { generateProfilePdf } from '../../src/services/pdfGenerator.service.js';
import { extractTextFromPdf } from '../../src/services/pdfParser.service.js';
import { readData, type AuthData } from '../http.js';

let mongo: MongoMemoryServer;
let server: Server;
let base: string;
let a: string;
let b: string;
let id: string;
let otherId: string;
let versionId: string;
let calls = 0;
let unavailable = false;
let gate: { entered: () => void; wait: Promise<void> } | undefined;
const content: ResumeContent = { personalInfo: { fullName: 'Synthetic Skill Reviewer' },
  experiences: [], education: [], projects: [], skills: ['reactjs', 'Unlisted tool', 'SQL, reporting'] };
type Saved = ResumeContent & { profileId: string; revision: number; skillNormalization?: SkillNormalization; analysis?: unknown };
function suggestion(skills: string[]) {
  const result = skillSnapshot(skills, unavailable ? 'unavailable' : 'ready');
  if (!unavailable) for (const entry of result.entries) {
    if (entry.raw === 'reactjs') Object.assign(entry, { suggestion: 'React.js', method: 'model' });
  }
  return result;
}
const normalize = async (skills: string[]) => {
  calls++;
  assert.ok(skills.every(skill => content.skills.includes(skill) || ['React.js', 'My new tool'].includes(skill)));
  if (gate) { gate.entered(); await gate.wait; }
  return suggestion(skills);
};
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'skill_review_isolated' });
  await Promise.all([Profile.init(), User.init(), Session.init()]);
  const versions = createVersionRouter({ review: async (_resume, _jd, revision) => ({ schemaVersion: 1, revision,
    generatedAt: new Date().toISOString(), requirements: [], suggestions: [], usage: { model: 'synthetic', inputTokens: 1, outputTokens: 1 } }) }, normalize);
  server = createApp(createProfileRouter({ parse: async () => 'Synthetic resume', extract: async () => content,
    normalize: async () => suggestion(content.skills), pdf: generateProfilePdf }, versions, normalize)).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}, { timeout: 300000 });
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await mongoose.disconnect(); if (mongo) await mongo.stop();
});
function request(path: string, method = 'GET', token?: string, body?: object) {
  return fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
const path = () => `/api/profile/${id}`;
const current = async () => readData<Saved>(await request('/api/profile/me', 'GET', a));

test('manual and imported resumes preserve raw names; imports persist pending suggestions separately', async () => {
  for (const email of ['skill-owner@example.invalid', 'skill-other@example.invalid']) {
    const response = await request('/api/auth/register', 'POST', undefined, { email, password: 'synthetic password' });
    assert.equal(response.status, 201); const data = await readData<AuthData>(response);
    if (!a) a = data.token; else b = data.token;
  }
  const created = await request('/api/profile', 'POST', a, content);
  id = (await readData<Saved>(created)).profileId;
  const form = new FormData(); form.append('resume', new Blob(['%PDF-synthetic'], { type: 'application/pdf' }), 'synthetic.pdf');
  const uploaded = await fetch(base + '/api/profile/upload', { method: 'POST', headers: { Authorization: `Bearer ${b}` }, body: form });
  assert.equal(uploaded.status, 200);
  const data = await readData<Saved>(uploaded); otherId = data.profileId;
  assert.deepEqual(data.skills, content.skills);
  assert.equal(data.skillNormalization?.entries[0]?.suggestion, 'React.js');
  assert.equal(data.skillNormalization?.entries[0]?.choice, 'pending');
  assert.equal((await Profile.findById(otherId))?.skills[1], 'Unlisted tool');
});

test('anonymous and foreign requests cannot normalize skills or invoke providers', async () => {
  assert.equal((await request(path() + '/skills/normalize', 'POST', undefined, { revision: 0 })).status, 401);
  assert.equal((await request(path() + '/skills/normalize', 'POST', b, { revision: 0 })).status, 404);
  assert.equal(calls, 0);
  assert.equal((await request(path() + '/skills/normalize', 'POST', a, { revision: 0, skills: ['Forged'] })).status, 400);
  assert.equal((await request(path() + '/skills/normalize', 'POST', a, { revision: 99 })).status, 409);
  assert.equal(calls, 0);
});

test('saved names are reviewed once without changing content and decisions survive reload and real PDF export', async () => {
  const response = await request(path() + '/skills/normalize', 'POST', a, { revision: 0 });
  assert.equal(response.status, 200);
  const reviewed = await readData<Saved>(response);
  assert.equal(reviewed.revision, 1); assert.deepEqual(reviewed.skills, content.skills); assert.equal(calls, 1);
  assert.equal(reviewed.skillNormalization?.entries[1]?.suggestion, null);
  const changed = { ...content, skills: ['React.js', 'My new tool', 'SQL, reporting'] };
  const saved = await request(path(), 'PUT', a, { revision: 1, content: changed, skillReviews: [
    { id: 'skill:0', choice: 'suggested' }, { id: 'skill:1', choice: 'custom', value: 'My new tool' },
    { id: 'skill:2', choice: 'original' },
  ] });
  assert.equal(saved.status, 200);
  const loaded = await current();
  assert.equal(loaded.revision, 2);
  assert.deepEqual(loaded.skillNormalization?.entries.map(entry => entry.choice), ['suggested', 'custom', 'original']);
  assert.deepEqual(loaded.skillNormalization?.entries.map(entry => entry.raw), content.skills);
  const pdf = await request(path() + '/export?revision=2', 'GET', a);
  assert.equal(pdf.status, 200);
  const text = await extractTextFromPdf(Buffer.from(await pdf.arrayBuffer()));
  for (const value of changed.skills) assert.ok(text.includes(value));
  assert.ok(!text.includes('reactjs')); assert.ok(!text.includes('Unlisted tool'));
  assert.equal(calls, 1); // Editing, reload and export never invoke normalization.
});

test('forged provenance and invalid decisions cannot mutate a saved review', async () => {
  const before = await Profile.findById(id).lean();
  const bodies = [
    { revision: 2, content, skillNormalization: suggestion(content.skills) },
    { revision: 2, content, skillReviews: [{ id: 'skill:0', choice: 'suggested', value: 'Invented' }] },
    { revision: 2, content, skillReviews: [{ id: 'skill:1', choice: 'suggested' }] },
    { revision: 2, content, skillReviews: [{ id: 'unknown', choice: 'original' }] },
  ];
  for (const body of bodies) assert.equal((await request(path(), 'PUT', a, body)).status, 400);
  assert.equal((await request(path(), 'PUT', a, { revision: 1, content, skillReviews: [{ id: 'skill:0', choice: 'original' }] })).status, 409);
  assert.deepEqual(await Profile.findById(id).lean(), before);
});

test('job copies retain provenance independently, enforce ownership, and reassess job analysis locally', async () => {
  const root = path() + '/versions';
  const created = await request(root, 'POST', a, { revision: 2, label: 'Synthetic role', jobDescription: 'React required.' });
  assert.equal(created.status, 201);
  const version = await readData<Saved>(created);
  versionId = version.profileId;
  const vpath = `${root}/${version.profileId}`;
  assert.deepEqual(version.skillNormalization, (await current()).skillNormalization);
  const beforeCalls = calls;
  for (const token of [undefined, b]) assert.equal((await request(vpath + '/skills/normalize', 'POST', token, { revision: 0 })).status, token ? 404 : 401);
  assert.equal((await request(`/api/profile/${otherId}/versions/${version.profileId}/skills/normalize`, 'POST', b, { revision: 0 })).status, 404);
  assert.equal(calls, beforeCalls);
  assert.equal((await request(vpath, 'PUT', a, { revision: 0, content, skillReviews: [{ id: 'skill:0', choice: 'original' }] })).status, 200);
  assert.equal((await request(vpath + '/review', 'POST', a, { revision: 1 })).status, 200);
  const normalized = await request(vpath + '/skills/normalize', 'POST', a, { revision: 1 });
  assert.equal(normalized.status, 200);
  const latest = await readData<Saved>(normalized);
  assert.equal(latest.revision, 2); assert.ok(latest.analysis);
  assert.equal(latest.skillNormalization?.entries[0]?.choice, 'pending');
  assert.equal((await current()).skillNormalization?.entries[0]?.choice, 'suggested');
  const saved = await request(vpath, 'PUT', a, { revision: 2, content: { ...content, skills: ['React.js', ...content.skills.slice(1)] }, skillReviews: [{ id: 'skill:0', choice: 'suggested' }] });
  assert.equal(saved.status, 200);
  assert.equal((await readData<Saved>(await request(vpath, 'GET', a))).skillNormalization?.entries[0]?.choice, 'suggested');
});

test('concurrent normalization is refused and a stale result cannot overwrite newer resume content', async () => {
  let entered!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  gate = { entered, wait: new Promise<void>(resolve => { release = resolve; }) };
  const before = await current();
  const pending = request(path() + '/skills/normalize', 'POST', a, { revision: before.revision });
  await started;
  try {
    assert.equal((await request(path() + '/skills/normalize', 'POST', a, { revision: before.revision })).status, 429);
    assert.equal((await request(`${path()}/versions/${versionId}/skills/normalize`, 'POST', a, { revision: 3 })).status, 429);
    const save = await request(path(), 'PUT', a, { revision: before.revision, content });
    assert.equal(save.status, 200);
  } finally { release(); gate = undefined; }
  assert.equal((await pending).status, 409);
  assert.deepEqual((await current()).skillNormalization, before.skillNormalization);
  assert.deepEqual((await current()).skills, content.skills);
});

test('a job normalization result cannot write after a parallel plan-counter change', async () => {
  const vpath = `${path()}/versions/${versionId}`;
  const before = await readData<Saved>(await request(vpath, 'GET', a));
  let entered!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  gate = { entered, wait: new Promise<void>(resolve => { release = resolve; }) };
  const pending = request(vpath + '/skills/normalize', 'POST', a, { revision: before.revision });
  await started;
  try {
    // Simulate the independent metadata counter advanced by a plan mutation.
    await Profile.updateOne({ _id: id, 'versions._id': versionId }, { $inc: { 'versions.$.plansRevision': 1 } });
  } finally { release(); gate = undefined; }
  assert.equal((await pending).status, 409);
  const after = await readData<Saved>(await request(vpath, 'GET', a));
  assert.equal(after.revision, before.revision);
  assert.deepEqual(after.skillNormalization, before.skillNormalization);
});

test('unavailable suggestions keep raw skills, remain editable, and a later request can recover', async () => {
  unavailable = true;
  const response = await request(path() + '/skills/normalize', 'POST', a, { revision: (await current()).revision });
  assert.equal(response.status, 200);
  const data = await readData<Saved>(response);
  assert.equal(data.skillNormalization?.status, 'unavailable'); assert.deepEqual(data.skills, content.skills);
  assert.ok(data.skillNormalization?.entries.every(entry => entry.suggestion === null));
  assert.equal((await request(path(), 'PUT', a, { revision: data.revision, content, skillReviews: [{ id: 'skill:0', choice: 'original' }] })).status, 200);
  unavailable = false;
  const retry = await request(path() + '/skills/normalize', 'POST', a, { revision: (await current()).revision });
  assert.equal(retry.status, 200);
  assert.equal((await readData<Saved>(retry)).skillNormalization?.status, 'ready');
});
