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
import { parseWordingOutput, type WordingContext, type WordingOutput } from '../../src/services/wording.js';
import { WordingError } from '../../src/services/wordingError.js';
import type { JobReview } from '../../src/services/jobReview.js';
import type { ResumeContent } from '../../src/validation/resume.js';
import { extractTextFromPdf } from '../../src/services/pdfParser.service.js';
import { readData, type AuthData } from '../http.js';

let server: Server; let mongo: MongoMemoryServer; let base: string; let sequence = 0; let calls = 0;
let mode: 'ready' | 'empty' | 'failure' = 'ready';
let gate: { entered: () => void; wait: Promise<void> } | undefined;
const original = 'Utilized React in order to build 3 screens with a teammate.\nAssisted with tests; did not lead the team.';
const proposed = 'Used React to build 3 screens with a teammate.\nAssisted with tests; did not lead the team.';
const content: ResumeContent = { personalInfo: { fullName: 'Private Synthetic Candidate', email: 'private@example.invalid' }, skills: ['Docker'], experiences: [], education: [],
  projects: [{ title: 'Private Demo', techStack: ['React'], description: original }] };
const jd = 'React and Docker are required. Kubernetes is preferred. Go is optional.';
const rows = ['React', 'Docker', 'Kubernetes', 'Go'].map((term, i) => ({ label: term, term, kind: 'skill', priority: i < 2 ? 'required' : 'preferred',
  quote: i < 2 ? 'React and Docker are required.' : i === 2 ? 'Kubernetes is preferred.' : 'Go is optional.', excluded: term === 'Go' }));
type Version = ResumeContent & { profileId: string; revision: number; analysis: JobReview };
before(async () => {
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri(), { dbName: 'wording_isolated' });
  await Promise.all([User.init(), Session.init(), Profile.init()]);
  const versions = createVersionRouter(undefined, undefined, async (context: WordingContext): Promise<WordingOutput> => {
    calls++; if (gate) { gate.entered(); await gate.wait; }
    if (mode === 'failure') throw new WordingError('invalid_output');
    const suggestion = parseWordingOutput({ edits: mode === 'empty' ? [] : [{ lineIndex: 0, proposed: proposed.split('\n')[0] }] }, context);
    return { suggestion, usage: { model: 'synthetic', inputTokens: 100, outputTokens: 30 } };
  });
  server = createApp(createProfileRouter(undefined, versions)).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}, { timeout: 300000 });
after(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await mongoose.disconnect(); if (mongo) await mongo.stop(); });
function request(path: string, token?: string, body?: object, method = body ? 'POST' : 'GET') {
  return fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
async function fixture() {
  mode = 'ready';
  const auth = await request('/api/auth/register', undefined, { email: `wording-${++sequence}@example.invalid`, password: 'synthetic password' });
  assert.equal(auth.status, 201); const token = (await readData<AuthData>(auth)).token;
  const profile = await readData<Version>(await request('/api/profile', token, content));
  const created = await request(`/api/profile/${profile.profileId}/versions`, token, { revision: 0, label: 'Synthetic job', jobDescription: jd });
  assert.equal(created.status, 201); const v = await readData<Version>(created);
  const path = `/api/profile/${profile.profileId}/versions/${v.profileId}`;
  const reviewed = await request(path + '/requirements', token, { revision: 0, reviewedAt: null, requirements: rows }, 'PUT');
  assert.equal(reviewed.status, 200); const version = await readData<Version>(reviewed);
  const body = { revision: version.revision, reviewedAt: version.analysis.generatedAt, sourceId: 'project:0', requirementId: version.analysis.requirements[0]!.id, consent: true };
  return { token, path, profileId: profile.profileId, version, body, current: async () => readData<Version>(await request(path, token)) };
}

test('anonymous and foreign wording requests disclose nothing and perform no provider work', async () => {
  const owner = await fixture(); const other = await fixture(); const before = calls;
  assert.equal((await request(owner.path + '/wording', undefined, owner.body)).status, 401);
  assert.equal((await request(owner.path + '/wording', other.token, owner.body)).status, 404);
  assert.equal((await request(owner.path.replace(owner.profileId, other.profileId) + '/wording', other.token, owner.body)).status, 404);
  assert.equal(calls, before);
});

test('forged input, absent consent, unsupported sources/skills and stale reviews fail before provider work', async () => {
  const f = await fixture(); const before = calls;
  const snapshot = await Profile.findById(f.profileId).select('+versions').lean();
  const invalid = [
    { ...f.body, consent: false }, { ...f.body, content: 'injected' }, { ...f.body, score: 100 },
    { ...f.body, sourceId: 'summary' }, { ...f.body, sourceId: 'project:9' },
    ...f.version.analysis.requirements.slice(1).map(r => ({ ...f.body, requirementId: r.id })),
  ];
  for (const body of invalid) assert.equal((await request(f.path + '/wording', f.token, body)).status, 400);
  assert.equal((await request(f.path + '/wording', f.token, { ...f.body, revision: 0 })).status, 409);
  assert.equal((await request(f.path + '/wording', f.token, { ...f.body, reviewedAt: 'stale' })).status, 409);
  assert.equal(calls, before); assert.deepEqual(await Profile.findById(f.profileId).select('+versions').lean(), snapshot);
});

test('proposal is read-only; explicit resume save persists wording, recalculates coverage and exports only saved facts', async () => {
  const f = await fixture(); const snapshot = await Profile.findById(f.profileId).select('+versions').lean();
  const response = await request(f.path + '/wording', f.token, f.body); assert.equal(response.status, 200);
  const output = await readData<WordingOutput & { revision: number; reviewedAt: string; requirement: { quote: string } }>(response);
  assert.equal(output.suggestion?.proposed, proposed); assert.equal(output.revision, f.version.revision);
  assert.equal(output.reviewedAt, f.version.analysis.generatedAt); assert.equal(output.requirement.quote, rows[0]!.quote);
  assert.deepEqual(await Profile.findById(f.profileId).select('+versions').lean(), snapshot);
  const beforePdf = await request(f.path + `/export?revision=${f.version.revision}`, f.token);
  assert.ok((await extractTextFromPdf(Buffer.from(await beforePdf.arrayBuffer()))).includes('Utilized React'));
  const savedContent = { ...content, projects: [{ ...content.projects[0]!, description: output.suggestion!.proposed }] };
  const saved = await request(f.path, f.token, { revision: f.version.revision, content: savedContent }, 'PUT'); assert.equal(saved.status, 200);
  const v = await f.current(); assert.equal(v.projects[0]!.description, proposed); assert.equal(v.analysis.revision, v.revision);
  assert.equal(v.analysis.coverage?.groups.required.workPercent, 50); // Copy editing cannot manufacture missing Docker evidence.
  assert.equal((await Profile.findById(f.profileId))?.projects[0]!.description, original);
  const pdf = await request(f.path + `/export?revision=${v.revision}`, f.token); assert.equal(pdf.status, 200);
  const text = await extractTextFromPdf(Buffer.from(await pdf.arrayBuffer()));
  assert.ok(text.includes('Used React')); assert.ok(text.includes('did not lead')); assert.ok(!text.includes('React and Docker are required')); assert.ok(!text.includes('synthetic'));
});

test('oversized descriptions and uncertain wording cannot use stale positive evidence to request a rewrite', async () => {
  const f = await fixture(); const before = calls;
  for (const description of ['React ' + 'x'.repeat(4000), 'I have never used React.']) {
    await Profile.updateOne({ _id: f.profileId, 'versions._id': f.version.profileId }, { $set: { 'versions.$.content.projects.0.description': description } });
    assert.equal((await request(f.path + '/wording', f.token, f.body)).status, 400);
  }
  assert.equal(calls, before);
});

test('empty and failed proposals preserve saved data; a later request recovers', async () => {
  const f = await fixture(); const snapshot = await Profile.findById(f.profileId).select('+versions').lean();
  mode = 'empty'; const empty = await request(f.path + '/wording', f.token, f.body); assert.equal(empty.status, 200); assert.equal((await readData<WordingOutput>(empty)).suggestion, null);
  mode = 'failure'; const failed = await request(f.path + '/wording', f.token, f.body); assert.equal(failed.status, 503); assert.equal((await failed.json() as { code: string }).code, 'invalid_output');
  mode = 'ready'; assert.equal((await request(f.path + '/wording', f.token, f.body)).status, 200);
  assert.deepEqual(await Profile.findById(f.profileId).select('+versions').lean(), snapshot);
  const key = process.env.GROQ_API_KEY; delete process.env.GROQ_API_KEY;
  const standalone = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => standalone.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${(standalone.address() as { port: number }).port}${f.path}/wording`;
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${f.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(f.body) });
    assert.equal(response.status, 503); assert.equal((await response.json() as { code: string }).code, 'authentication');
    assert.deepEqual(await Profile.findById(f.profileId).select('+versions').lean(), snapshot);
  } finally {
    if (key === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = key;
    await new Promise<void>(resolve => standalone.close(() => resolve()));
  }
});

test('concurrent requests are refused and a late result after a resume save is discarded', async () => {
  const f = await fixture(); let entered!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }); gate = { entered, wait: new Promise<void>(resolve => { release = resolve; }) };
  const pending = request(f.path + '/wording', f.token, f.body); await started;
  try {
    assert.equal((await request(f.path + '/wording', f.token, f.body)).status, 429);
    assert.equal((await request(f.path, f.token, { revision: f.version.revision, content }, 'PUT')).status, 200);
  } finally { release(); gate = undefined; }
  assert.equal((await pending).status, 409);
  const v = await f.current(); assert.equal(v.projects[0]!.description, original);
  assert.equal((await request(f.path + '/wording', f.token, { ...f.body, revision: v.revision, reviewedAt: v.analysis.generatedAt })).status, 200);
});

test('deleting a job version during inference prevents a late proposal or resurrection', async () => {
  const f = await fixture(); let entered!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }); gate = { entered, wait: new Promise<void>(resolve => { release = resolve; }) };
  const pending = request(f.path + '/wording', f.token, f.body); await started;
  try { assert.equal((await request(f.path, f.token, undefined, 'DELETE')).status, 204); } finally { release(); gate = undefined; }
  assert.equal((await pending).status, 409); assert.equal((await request(f.path, f.token)).status, 404);
  assert.ok(await Profile.exists({ _id: f.profileId }));
});

test('per-account rate limit bounds repeated paid requests without a client-controlled identity', async () => {
  const f = await fixture(); mode = 'empty'; const before = calls;
  for (let i = 0; i < 10; i++) assert.equal((await request(f.path + '/wording', f.token, f.body)).status, 200);
  const limited = await request(f.path + '/wording', f.token, f.body); assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after'));
  assert.equal(calls - before, 10);
});
