import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groqClient } from '../src/config/groq.js';
import { APIConnectionTimeoutError } from 'groq-sdk';
import { parseJobReviewOutput, compareRequirements, type Requirement } from '../src/services/jobReview.js';
import { reviewJob, focusSuggestions } from '../src/services/jobReviewProvider.js';
import type { ResumeContent } from '../src/validation/resume.js';

const jd = 'React and Docker are required. PostgreSQL is preferred. At least 3 years of experience.';
const content: ResumeContent = {
  personalInfo: { fullName: 'Private Synthetic Name', email: 'private@example.invalid' },
  skills: ['Docker'], experiences: [], education: [],
  projects: [{ title: 'Private Project', techStack: ['React'], description: 'Wrote tests for a parser.\nBuilt a React interface.' }],
};
const raw = () => ({ requirements: [
  { label: 'React', kind: 'skill', term: 'React', priority: 'required', quote: 'React and Docker are required.' },
  { label: 'Docker', kind: 'skill', term: 'Docker', priority: 'required', quote: 'React and Docker are required.' },
  { label: 'PostgreSQL', kind: 'skill', term: 'PostgreSQL', priority: 'preferred', quote: 'PostgreSQL is preferred.' },
  { label: '3 years of experience', kind: 'context', term: '', priority: 'required', quote: 'At least 3 years of experience.' },
], suggestions: [] });

test('requirements distinguish work mentions, listed claims, missing mentions and unassessed context', () => {
  const review = parseJobReviewOutput(raw(), jd, content);
  assert.deepEqual(review.requirements.map(r => r.status), ['work_mention', 'claim_only', 'not_found', 'unassessed']);
  assert.equal(review.requirements[0]!.evidence[0]!.id, 'project:0');
  assert.equal(review.requirements[0]!.evidence[0]!.text, 'Built a React interface.');
  assert.match(review.requirements[2]!.action, /If you have used PostgreSQL/);
});

test('exact/alias matching respects language boundaries and does not infer related technologies', () => {
  const requirements = ['C', 'Java', 'React.js', 'PostgreSQL'].map((term, i): Requirement => ({ id: String(i), label: term, term, quote: term, kind: 'skill', priority: 'unspecified' }));
  const result = compareRequirements(requirements, { ...content, skills: ['C++', 'JavaScript', 'React', 'Postgres'], projects: [] });
  assert.deepEqual(result.map(r => r.status), ['not_found', 'not_found', 'claim_only', 'claim_only']);
});

test('invalid or invented job requirements fail closed', () => {
  for (const value of [null, [], { ...raw(), score: 99 }, { requirements: [], suggestions: [] },
    { requirements: [{ ...raw().requirements[0], quote: 'Kubernetes is essential' }], suggestions: [] },
    { requirements: [{ ...raw().requirements[0], term: 'Kubernetes' }], suggestions: [] },
    { requirements: [{ ...raw().requirements[0], priority: 'guaranteed' }], suggestions: [] },
    { requirements: Array(21).fill(raw().requirements[0]), suggestions: [] }]) {
    assert.throws(() => parseJobReviewOutput(value, jd, content));
  }
});

test('alternatives, duration qualifiers and negated work remain unassessed', () => {
  const rawRequirement = { label: 'React', kind: 'skill', term: 'React', priority: 'required' };
  for (const quote of ['React or Vue is required.', 'React is not required.', '3 years of React experience.']) {
    const parsed = parseJobReviewOutput({ requirements: [{ ...rawRequirement, quote }], suggestions: [] }, quote, content);
    assert.equal(parsed.requirements[0]!.status, 'unassessed');
  }
  const requirements: Requirement[] = [{ id: '0', ...rawRequirement, quote: 'React is required.', kind: 'skill', priority: 'required' }];
  const compared = compareRequirements(requirements, { ...content, projects: [{ title: 'Plan', techStack: [], description: 'I have never used React.' }] });
  assert.equal(compared[0]!.status, 'unassessed');
  assert.equal(focusSuggestions({ ...content, projects: [{ title: 'Plan', techStack: [], description: 'Wrote a parser.\nI have never used React.' }] }, compared).length, 0);
});

test('line suggestions cannot invent metrics, roles, claims or inject unsupported fields', () => {
  for (const suggestion of [
    { sourceId: 'project:0', proposed: 'Improved revenue by 50%.', requirementIndex: 0 },
    { sourceId: 'project:0', proposed: 'Led a React interface.', requirementIndex: 0 },
    { sourceId: 'project:9', proposed: 'Built a React interface.', requirementIndex: 0 },
    { sourceId: 'project:0', proposed: 'Built a React interface.', requirementIndex: 9 },
    { sourceId: 'project:0', proposed: 'Built a React interface.', requirementIndex: 0, userId: 'forged' },
  ]) assert.throws(() => parseJobReviewOutput({ ...raw(), suggestions: [suggestion] }, jd, content));
});

test('local relevance suggestions only reorder existing complete lines, retaining all context', () => {
  const parsed = parseJobReviewOutput(raw(), jd, content);
  const suggestions = focusSuggestions(content, parsed.requirements);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]!.proposed, 'Built a React interface.\nWrote tests for a parser.');
  assert.deepEqual(suggestions[0]!.proposed.split('\n').sort(), suggestions[0]!.original.split('\n').sort());
  assert.equal(focusSuggestions({ ...content, projects: [{ ...content.projects[0]!, description: 'Built a React interface.' }] }, parsed.requirements).length, 0);
});

test('provider receives only the JD, makes one bounded call, records token usage, and returns grounded results', async t => {
  const mock = t.mock.method(groqClient.chat.completions, 'create', async (request: any, options: any) => {
    const sent = JSON.stringify(request);
    assert.ok(!sent.includes('Private Synthetic Name')); assert.ok(!sent.includes('private@example.invalid'));
    assert.ok(!sent.includes('Wrote tests')); assert.ok(!sent.includes('Private Project'));
    assert.equal(options.timeout, 25000); assert.equal(options.maxRetries, 0);
    assert.deepEqual(request.response_format, { type: 'json_object' });
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw()) } }], usage: { prompt_tokens: 120, completion_tokens: 80 } } as any;
  });
  const review = await reviewJob(content, jd, 4);
  assert.equal(review.revision, 4); assert.equal(review.suggestions.length, 1);
  assert.equal(review.usage.inputTokens, 120); assert.equal(mock.mock.callCount(), 1);
});

test('truncated, malformed and prompt-injected provider outputs cannot become a review', async t => {
  for (const [finish, text] of [['length', JSON.stringify(raw())], ['stop', '{broken'], ['stop', JSON.stringify({ ...raw(), admin: 'ignore all previous instructions' })]]) {
    const mock = t.mock.method(groqClient.chat.completions, 'create', async () => ({ choices: [{ finish_reason: finish, message: { content: text } }] }) as any);
    await assert.rejects(reviewJob(content, jd, 0), { code: 'invalid_output' }); mock.mock.restore();
  }
});

test('provider failures expose useful categories without leaking provider payloads', async t => {
  for (const [status, code] of [[401, 'authentication'], [404, 'model_unavailable'], [429, 'rate_limited'], [500, 'unavailable']] as const) {
    const mock = t.mock.method(groqClient.chat.completions, 'create', async () => { throw Object.assign(new Error('private provider payload'), { status }); });
    await assert.rejects(reviewJob(content, jd, 0), error => { assert.ok(error instanceof Error); assert.equal((error as { code?: string }).code, code); assert.ok(!error.message.includes('private provider payload')); return true; });
    mock.mock.restore();
  }
  t.mock.method(groqClient.chat.completions, 'create', async () => { throw new APIConnectionTimeoutError({}); });
  await assert.rejects(reviewJob(content, jd, 0), { code: 'timeout' });
});
