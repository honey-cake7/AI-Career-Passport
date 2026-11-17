import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { createApp } from '../../src/app.js';
import { createProfileRouter } from '../../src/routes/profile.routes.js';
import { createVersionRouter } from '../../src/routes/version.routes.js';
import { Profile } from '../../src/models/Profile.js';
import { Session } from '../../src/models/Session.js';
import { User } from '../../src/models/User.js';
import { parseJobReviewOutput, type JobReview, type RequirementDefinition } from '../../src/services/jobReview.js';
import { definition } from '../../src/services/jobCoverage.js';
import type { GapPlan } from '../../src/services/gapPlans.js';
import type { ResumeContent } from '../../src/validation/resume.js';
import { extractTextFromPdf } from '../../src/services/pdfParser.service.js';
import { readData, type AuthData } from '../http.js';

let mongo: MongoMemoryServer; let server: Server; let base: string;
let owner: string; let other: string; let profileId: string; let otherProfileId: string; let versionId: string;
let calls = 0;
let gate: { entered: () => void; wait: Promise<void> } | undefined;
const content: ResumeContent = { personalInfo: { fullName: 'Synthetic Coverage Candidate' }, experiences: [], education: [],
  skills: ['Docker'], projects: [{ title: 'Demo', techStack: ['React'], description: 'Built a React interface.' }] };
const jd = 'React and Docker are required. Postgres is preferred. React.js is preferred. A degree is required. Kubernetes and Go are optional.';
const raw = [
  { label: 'React', term: 'React', kind: 'skill', quote: 'React and Docker are required.', priority: 'required' },
  { label: 'Docker', term: 'Docker', kind: 'skill', quote: 'React and Docker are required.', priority: 'required' },
  { label: 'Postgres', term: 'Postgres', kind: 'skill', quote: 'Postgres is preferred.', priority: 'preferred' },
  { label: 'React.js', term: 'React.js', kind: 'skill', quote: 'React.js is preferred.', priority: 'preferred' },
  { label: 'Degree', term: '', kind: 'context', quote: 'A degree is required.', priority: 'required' },
  { label: 'Kubernetes', term: 'Kubernetes', kind: 'skill', quote: 'Kubernetes and Go are optional.', priority: 'unspecified' },
] as const;
type Version = ResumeContent & { profileId: string; revision: number; analysis: JobReview | null; gapPlans: GapPlan[]; plansRevision: number };
const root = () => `/api/profile/${profileId}/versions`;
const path = () => `${root()}/${versionId}`;
function request(path: string, method = 'GET', token?: string, body?: object) {
  return fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
const current = async () => readData<Version>(await request(path(), 'GET', owner));
type Row = Omit<RequirementDefinition, 'id'> & { id?: string; excluded?: boolean };
const rows = (v: Version): Row[] => v.analysis!.requirements.map(r => ({ ...definition(r), excluded: !!r.excluded }));
const envelope = (v: Version, requirements: Row[] = rows(v)) => ({ revision: v.revision, reviewedAt: v.analysis?.generatedAt ?? null, requirements });
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'requirements_isolated' });
  await Promise.all([User.init(), Profile.init(), Session.init()]);
  const versions = createVersionRouter({ review: async (resume, job, revision) => {
    calls++; if (gate) { gate.entered(); await gate.wait; }
    return { ...parseJobReviewOutput({ requirements: raw, suggestions: [] }, job, resume), schemaVersion: 1, revision,
      generatedAt: new Date().toISOString(), usage: { model: 'synthetic', inputTokens: 80, outputTokens: 50 } };
  } });
  server = createApp(createProfileRouter(undefined, versions)).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}, { timeout: 300000 });
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await mongoose.disconnect(); if (mongo) await mongo.stop();
});

test('create isolated owners and an unreviewed job version', async () => {
  for (const email of ['coverage-owner@example.invalid', 'coverage-other@example.invalid']) {
    const auth = await request('/api/auth/register', 'POST', undefined, { email, password: 'synthetic password' });
    assert.equal(auth.status, 201); const token = (await readData<AuthData>(auth)).token;
    const created = await request('/api/profile', 'POST', token, content);
    assert.equal(created.status, 201); const profile = await readData<Version>(created);
    if (!owner) { owner = token; profileId = profile.profileId; } else { other = token; otherProfileId = profile.profileId; }
  }
  const created = await request(root(), 'POST', owner, { revision: 0, label: 'Synthetic role', jobDescription: jd });
  assert.equal(created.status, 201); versionId = (await readData<Version>(created)).profileId;
});

test('manual quoted requirements produce transparent coverage without AI and persist across reload', async () => {
  const body = { revision: 0, reviewedAt: null, requirements: raw.map(r => ({ ...r, excluded: false })) };
  assert.equal((await request(path() + '/requirements', 'PUT', undefined, body)).status, 401);
  assert.equal((await request(path() + '/requirements', 'PUT', other, body)).status, 404);
  assert.equal((await request(`/api/profile/${otherProfileId}/versions/${versionId}/requirements`, 'PUT', other, body)).status, 404);
  const response = await request(path() + '/requirements', 'PUT', owner, body);
  assert.equal(response.status, 200);
  const loaded = await current();
  assert.equal(loaded.revision, 1); assert.equal(loaded.analysis?.revision, 1);
  assert.deepEqual(loaded.analysis?.coverage?.groups.required, { assessed: 2, workMentions: 1, listedOnly: 1, notFound: 0, unassessed: 1, excluded: 0, duplicates: 0, workPercent: 50 });
  assert.equal(loaded.analysis?.coverage?.groups.preferred.duplicates, 1);
  assert.ok(loaded.analysis?.requirements.every(r => r.origin === 'user'));
  assert.equal(calls, 0);
  assert.equal((await request(path() + '/review', 'POST', owner, { revision: 1 })).status, 200); assert.equal(calls, 0);
});

test('forged scores/evidence, invented quotes, unknown IDs and stale snapshots leave Mongo unchanged', async () => {
  const v = await current(); const body = envelope(v); const before = await Profile.findById(profileId).select('+versions').lean();
  for (const invalid of [
    { ...body, score: 100 }, { ...body, coverage: { workPercent: 100 } },
    { ...body, requirements: [{ ...body.requirements[0], status: 'work_mention' }, ...body.requirements.slice(1)] },
    { ...body, requirements: [{ ...body.requirements[0], original: {} }, ...body.requirements.slice(1)] },
    { ...body, requirements: [{ ...body.requirements[0], id: 'unknown' }, ...body.requirements.slice(1)] },
    { ...body, requirements: [{ ...body.requirements[0], quote: 'Invented condition' }, ...body.requirements.slice(1)] },
    { ...body, requirements: body.requirements.slice(1) },
  ]) assert.equal((await request(path() + '/requirements', 'PUT', owner, invalid)).status, 400);
  assert.equal((await request(path() + '/requirements', 'PUT', owner, { ...body, reviewedAt: 'stale' })).status, 409);
  assert.equal((await request(path() + '/requirements', 'PUT', owner, { ...body, revision: 0 })).status, 409);
  assert.deepEqual(await Profile.findById(profileId).select('+versions').lean(), before);
});

test('priority corrections, exclusions and added source-grounded requirements change only the comparison', async () => {
  const v = await current();
  const requirements: Row[] = rows(v).map(r => ({ ...r, priority: r.term === 'Docker' ? 'preferred' : r.priority, excluded: r.term === 'Kubernetes' }));
  requirements.push({ label: 'Go', term: 'Go', kind: 'skill', quote: 'Kubernetes and Go are optional.', priority: 'unspecified', excluded: false });
  const response = await request(path() + '/requirements', 'PUT', owner, envelope(v, requirements));
  assert.equal(response.status, 200); const saved = await readData<Version>(response);
  assert.equal(saved.analysis?.coverage?.groups.required.workPercent, 100);
  assert.equal(saved.analysis?.coverage?.groups.preferred.assessed, 2);
  assert.equal(saved.analysis?.coverage?.groups.unspecified.excluded, 1);
  assert.equal(saved.analysis?.coverage?.groups.unspecified.notFound, 1);
  assert.deepEqual(saved.skills, content.skills); assert.equal(saved.projects[0].description, content.projects[0].description);
  assert.equal((await Profile.findById(profileId))?.revision, 0); assert.equal(calls, 0);
});

test('resume saves retain corrected requirements and recalculate work evidence with no provider call', async () => {
  const v = await current();
  const changed = { ...content, projects: [{ ...content.projects[0], description: 'Built a React interface.\nPackaged the demo with Docker.' }] };
  const response = await request(path(), 'PUT', owner, { revision: v.revision, content: changed });
  assert.equal(response.status, 200); const saved = await readData<Version>(response);
  assert.equal(saved.analysis?.revision, saved.revision);
  assert.equal(saved.analysis?.coverage?.groups.preferred.workPercent, 50);
  assert.equal(saved.analysis?.requirements.find(r => r.term === 'Docker')?.priority, 'preferred');
  assert.ok(saved.analysis?.requirements.find(r => r.term === 'Kubernetes')?.excluded);
  const pdf = await request(path() + `/export?revision=${saved.revision}`, 'GET', owner);
  assert.equal(pdf.status, 200); const text = await extractTextFromPdf(Buffer.from(await pdf.arrayBuffer()));
  assert.ok(text.includes('Packaged the demo with Docker.')); assert.ok(!text.includes('Resume coverage'));
  assert.equal(calls, 0);
});

test('competing requirement saves cannot lose changes; plans retain their frozen source after an exclusion', async () => {
  const v = await current(); const docker = v.analysis!.requirements.find(r => r.term === 'Docker')!;
  const plan = await request(path() + '/plans', 'POST', owner, { revision: v.revision, plansRevision: v.plansRevision, requirementId: docker.id, confirmation: 'has_experience' });
  assert.equal(plan.status, 200);
  const requirements = rows(v).map(r => ({ ...r, excluded: r.id === docker.id || r.excluded }));
  const results = await Promise.all([request(path() + '/requirements', 'PUT', owner, envelope(v, requirements)), request(path() + '/requirements', 'PUT', owner, envelope(v, requirements))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const saved = await current();
  assert.equal(saved.gapPlans[0].requirement.priority, 'preferred'); assert.equal(saved.gapPlans[0].assessment.revision, v.revision);
  assert.ok(saved.analysis?.requirements.find(r => r.id === docker.id)?.excluded);
  assert.equal((await request(path() + '/plans', 'POST', owner, { revision: saved.revision, plansRevision: saved.plansRevision, requirementId: docker.id, confirmation: 'has_experience' })).status, 400);
});

test('all excluded requirements yield unavailable percentages, never a fabricated zero score', async () => {
  const v = await current();
  const response = await request(path() + '/requirements', 'PUT', owner, envelope(v, rows(v).map(r => ({ ...r, excluded: true }))));
  assert.equal(response.status, 200);
  const saved = await readData<Version>(response);
  assert.ok(Object.values(saved.analysis!.coverage!.groups).every(group => group.workPercent === null && group.assessed === 0));
  assert.equal(saved.analysis!.requirements.length, 7); assert.equal(calls, 0);
});

test('model-extracted originals survive corrections and a late AI result cannot overwrite manual requirements', async () => {
  const response = await request(root(), 'POST', owner, { revision: 0, label: 'Model extraction example', jobDescription: jd });
  const id = (await readData<Version>(response)).profileId; const target = `${root()}/${id}`;
  assert.equal((await request(target + '/review', 'POST', owner, { revision: 0 })).status, 200);
  const v = await readData<Version>(await request(target, 'GET', owner));
  const modified = rows(v).map(r => ({ ...r, priority: r.term === 'React' ? 'preferred' as const : r.priority }));
  const savedResponse = await request(target + '/requirements', 'PUT', owner, envelope(v, modified));
  assert.equal(savedResponse.status, 200); const saved = await readData<Version>(savedResponse);
  assert.equal(saved.analysis!.requirements[0].original?.priority, 'required'); assert.equal(saved.analysis!.requirements[0].priority, 'preferred');
  assert.equal(calls, 1);
  const fresh = await request(root(), 'POST', owner, { revision: 0, label: 'Concurrent manual example', jobDescription: jd });
  const newId = (await readData<Version>(fresh)).profileId; const newPath = `${root()}/${newId}`;
  let entered!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }); gate = { entered, wait: new Promise<void>(resolve => { release = resolve; }) };
  const pending = request(newPath + '/review', 'POST', owner, { revision: 0 }); await started;
  try { assert.equal((await request(newPath + '/requirements', 'PUT', owner, { revision: 0, reviewedAt: null, requirements: [{ ...raw[0], priority: 'preferred' }] })).status, 200); }
  finally { release(); gate = undefined; }
  assert.equal((await pending).status, 409);
  const manual = await readData<Version>(await request(newPath, 'GET', owner));
  assert.equal(manual.analysis!.requirements.length, 1); assert.equal(manual.analysis!.requirements[0].priority, 'preferred');
});
