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
import { parseJobReviewOutput } from '../../src/services/jobReview.js';
import { createGapPlan, type GapPlan } from '../../src/services/gapPlans.js';
import { readData, type AuthData } from '../http.js';

let mongo: MongoMemoryServer; let server: Server; let base: string;
let owner: string; let other: string; let profileId: string; let otherProfileId: string; let versionId: string;
let calls = 0;
let gate: { entered: () => void; wait: Promise<void> } | null = null;
const jd = 'Docker is required. React is preferred. Three years of professional experience.';
const content = { personalInfo: { fullName: 'Synthetic Candidate' }, experiences: [], education: [], projects: [{ title: 'Demo', techStack: [], description: 'Built a local demo.' }], skills: [] };
type State = { gapPlans: GapPlan[]; plansRevision: number; revision: number };
type Version = State & { profileId: string; analysis: unknown; projects: typeof content.projects };
let current: State;
const root = () => `/api/profile/${profileId}/versions`;
const version = () => `${root()}/${versionId}`;
const plans = () => `${version()}/plans`;
const body = () => ({ revision: current.revision, plansRevision: current.plansRevision });
const editable = (p: GapPlan) => ({ task: p.task, criteria: p.criteria, checks: p.checks, status: p.status, notes: p.notes, link: p.link });
function request(path: string, method = 'GET', token?: string, payload?: object) {
  return fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(payload && method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) }, body: payload && method !== 'GET' ? JSON.stringify(payload) : undefined });
}
async function successful(path: string, method: string, payload: object) {
  const response = await request(path, method, owner, payload); assert.equal(response.status, 200, await response.clone().text());
  current = await readData<State>(response); return current;
}
before(async () => {
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri(), { dbName: 'gap_plans_isolated_test' });
  await Promise.all([User.init(), Session.init(), Profile.init()]);
  const router = createVersionRouter({ review: async (resume, job, revision) => {
    calls++; if (gate) { gate.entered(); await gate.wait; }
    return { ...parseJobReviewOutput({ requirements: [
      { label: 'Docker', quote: 'Docker is required.', kind: 'skill', term: 'Docker', priority: 'required' },
      { label: 'React', quote: 'React is preferred.', kind: 'skill', term: 'React', priority: 'preferred' },
      { label: 'Three years', quote: 'Three years of professional experience.', kind: 'context', term: '', priority: 'required' },
    ], suggestions: [] }, job, resume), schemaVersion: 1, revision, generatedAt: new Date().toISOString(), usage: { model: 'synthetic', inputTokens: 10, outputTokens: 10 } };
  } });
  server = createApp(createProfileRouter(undefined, router)).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  for (const email of ['plans-owner@example.invalid', 'plans-other@example.invalid']) {
    const registered = await request('/api/auth/register', 'POST', undefined, { email, password: 'synthetic password' });
    assert.equal(registered.status, 201); const token = (await readData<AuthData>(registered)).token;
    const profile = await request('/api/profile', 'POST', token, content); assert.equal(profile.status, 201);
    const id = (await readData<{ profileId: string }>(profile)).profileId;
    if (!owner) { owner = token; profileId = id; } else { other = token; otherProfileId = id; }
  }
  const created = await request(root(), 'POST', owner, { label: 'Example role', jobDescription: jd, revision: 0 });
  assert.equal(created.status, 201); const v = await readData<Version>(created); versionId = v.profileId; current = v;
}, { timeout: 300000 });
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await mongoose.disconnect(); if (mongo) await mongo.stop();
});

test('all plan operations require authentication and ownership of both parent and version', async () => {
  for (const [suffix, method] of [['', 'GET'], ['', 'POST'], ['/507f1f77bcf86cd799439011', 'PUT'], ['/507f1f77bcf86cd799439011', 'DELETE'], ['/507f1f77bcf86cd799439011/reassess', 'POST']]) {
    assert.equal((await request(plans() + suffix, method)).status, 401);
    assert.equal((await request(plans() + suffix, method, other, body())).status, 404);
    assert.equal((await request(`/api/profile/${otherProfileId}/versions/${versionId}/plans${suffix}`, method, other, body())).status, 404);
  }
  assert.equal(calls, 0);
});
test('only current server-reviewed requirements can create a plan; legacy counters start at zero', async () => {
  const payload = { ...body(), requirementId: 'requirement:0', confirmation: 'needs_practice' };
  assert.equal((await request(plans(), 'POST', owner, payload)).status, 409);
  await Profile.updateOne({ _id: profileId }, { $unset: { 'versions.0.plansRevision': 1, 'versions.0.gapPlans': 1 } });
  assert.equal((await request(version() + '/review', 'POST', owner, { revision: 0 })).status, 200);
  assert.equal((await request(plans(), 'POST', owner, { ...payload, requirement: { term: 'forged' } })).status, 400);
  assert.equal((await request(plans(), 'POST', owner, { ...payload, requirementId: 'missing' })).status, 400);
  assert.equal((await request(plans(), 'POST', owner, { ...payload, requirementId: 'requirement:2' })).status, 400);
  await successful(plans(), 'POST', payload);
  assert.equal(current.plansRevision, 1); assert.equal(current.revision, 0); assert.equal(current.gapPlans.length, 1);
  assert.equal(current.gapPlans[0]!.assessment.status, 'not_found');
  assert.equal((await request(plans(), 'POST', owner, { ...body(), requirementId: 'requirement:0', confirmation: 'has_experience' })).status, 409);
  assert.equal(calls, 1);
});
test('invalid completion and forged metadata never alter the saved plan', async () => {
  const plan = current.gapPlans[0]!;
  for (const update of [{ ...editable(plan), status: 'completed' }, { ...editable(plan), requirement: plan.requirement }, { ...editable(plan), link: 'javascript:alert(1)' }]) {
    assert.equal((await request(`${plans()}/${plan.id}`, 'PUT', owner, { ...body(), plan: update })).status, 400);
  }
  assert.equal((await request(`${plans()}/507f1f77bcf86cd799439011`, 'PUT', owner, { ...body(), plan: editable(plan) })).status, 404);
  const reopened = await readData<State>(await request(plans(), 'GET', owner)); assert.deepEqual(reopened, current);
});
test('atomic plan counters prevent competing edits and preserve successful self-reported outcomes', async () => {
  const plan = current.gapPlans[0]!;
  const payload = { ...body(), plan: { ...editable(plan), status: 'completed', checks: plan.checks.map(() => true), notes: 'Packaged the demo and checked startup with test configuration.', link: 'https://example.invalid/demo' } };
  const competing = await Promise.all([request(`${plans()}/${plan.id}`, 'PUT', owner, payload), request(`${plans()}/${plan.id}`, 'PUT', owner, payload)]);
  assert.deepEqual(competing.map(r => r.status).sort(), [200, 409]);
  current = await readData<State>(await request(plans(), 'GET', owner));
  assert.equal(current.plansRevision, 2); assert.equal(current.revision, 0);
  assert.equal(current.gapPlans[0]!.status, 'completed'); assert.equal(current.gapPlans[0]!.assessment.status, 'not_found');
  const saved = await readData<Version>(await request(version(), 'GET', owner));
  assert.ok(saved.analysis); assert.deepEqual(saved.projects, content.projects.map(p => ({ ...p, link: '' })));
  assert.equal((await Profile.findById(profileId))?.revision, 0); assert.equal(calls, 1);
});
test('resume changes retain plans; local reassessment changes evidence without changing task status', async () => {
  const changed = { ...content, projects: [{ ...content.projects[0]!, description: 'Packaged this demo with Docker and tested startup.' }] };
  assert.equal((await request(version(), 'PUT', owner, { revision: 0, content: changed })).status, 200);
  const loaded = await readData<Version>(await request(version(), 'GET', owner));
  assert.ok(loaded.analysis); assert.equal(loaded.gapPlans[0]!.assessment.revision, 0); assert.equal(loaded.revision, 1);
  assert.equal((await request(`${plans()}/${current.gapPlans[0]!.id}/reassess`, 'POST', owner, body())).status, 409);
  current = loaded;
  await successful(`${plans()}/${current.gapPlans[0]!.id}/reassess`, 'POST', body());
  assert.equal(current.gapPlans[0]!.assessment.status, 'work_mention'); assert.equal(current.gapPlans[0]!.assessment.revision, 1);
  assert.equal(current.gapPlans[0]!.status, 'completed'); assert.equal(calls, 1);
  await successful(`${plans()}/${current.gapPlans[0]!.id}`, 'PUT', { ...body(), plan: { ...editable(current.gapPlans[0]!), status: 'in_progress' } });
  assert.equal(current.gapPlans[0]!.assessment.status, 'work_mention');
});
test('a plan mutation during an AI review prevents stale analysis from being attached', async () => {
  await Profile.updateOne({ _id: profileId, 'versions._id': versionId }, { $unset: { 'versions.$.analysis': 1 } });
  let entered!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  gate = { entered, wait: new Promise<void>(resolve => { release = resolve; }) };
  const pending = request(version() + '/review', 'POST', owner, { revision: current.revision });
  await started;
  try { await successful(`${plans()}/${current.gapPlans[0]!.id}`, 'PUT', { ...body(), plan: { ...editable(current.gapPlans[0]!), notes: 'A more precise private outcome note.' } }); }
  finally { release(); gate = null; }
  assert.equal((await pending).status, 409);
  assert.equal((await readData<Version>(await request(version(), 'GET', owner))).analysis, null);
  assert.equal((await request(version() + '/review', 'POST', owner, { revision: current.revision })).status, 200);
});
test('the plan count is bounded and stale metadata counters cannot write after a capacity change', async () => {
  const backup = current;
  // Prepare a full, synthetic legacy fixture; capacity enforcement is at the HTTP
  // mutation boundary, not a claim that direct database writes are validated.
  const full = Array.from({ length: 20 }, (_, i) => createGapPlan({ ...backup.gapPlans[0]!.requirement, quote: `Synthetic Docker requirement ${i}.` }, 'needs_review', content, backup.revision));
  await Profile.updateOne({ _id: profileId }, { $set: { 'versions.0.gapPlans': full }, $inc: { 'versions.0.plansRevision': 1 } });
  assert.equal((await request(plans(), 'POST', owner, { ...body(), requirementId: 'requirement:1', confirmation: 'needs_practice' })).status, 409);
  current = await readData<State>(await request(plans(), 'GET', owner));
  const capped = await request(plans(), 'POST', owner, { ...body(), requirementId: 'requirement:1', confirmation: 'needs_practice' });
  assert.equal(capped.status, 400); assert.match(await capped.text(), /at most 20/);
  await Profile.updateOne({ _id: profileId }, { $set: { 'versions.0.gapPlans': backup.gapPlans }, $inc: { 'versions.0.plansRevision': 1 } });
  current = await readData<State>(await request(plans(), 'GET', owner));
});
test('manual checks can be saved, plans can be deleted, and parent deletion removes their private data', async () => {
  await successful(plans(), 'POST', { ...body(), requirementId: 'requirement:2', confirmation: 'needs_review' });
  assert.equal(current.gapPlans[1]!.assessment.status, 'unassessed');
  const deleted = current.gapPlans[0]!.id;
  await successful(`${plans()}/${deleted}`, 'DELETE', body()); assert.equal(current.gapPlans.length, 1);
  assert.equal((await request(`${plans()}/${deleted}/reassess`, 'POST', owner, body())).status, 404);
  assert.equal((await request(`/api/profile/${profileId}`, 'DELETE', owner)).status, 204);
  assert.equal(await Profile.countDocuments({ _id: profileId }), 0);
  assert.equal((await request(plans(), 'GET', owner)).status, 404); assert.ok(await Profile.findById(otherProfileId));
});
