import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APIConnectionTimeoutError } from 'groq-sdk';
import { groqClient } from '../src/config/groq.js';
import { passesWordingChecks, parseWordingOutput, type WordingContext } from '../src/services/wording.js';
import { suggestWording } from '../src/services/wordingProvider.js';

const original = 'Utilized React in order to build 3 screens with a teammate.\nAssisted with tests; did not lead the team.';
const proposed = 'Used React to build 3 screens with a teammate.';
const context: WordingContext = { source: { id: 'project:0', label: 'Private synthetic project title', text: original },
  requirement: { id: 'r:0', label: 'React', quote: 'React is required.', term: 'React', kind: 'skill', priority: 'required', status: 'work_mention', evidence: [], action: '' } };
const valid = () => ({ edits: [{ lineIndex: 0, proposed }] });

test('wording checks allow bounded concision and keep every surrounding line', () => {
  const result = parseWordingOutput(valid(), context)!;
  assert.equal(result.original, original); assert.equal(result.proposed, proposed + '\nAssisted with tests; did not lead the team.');
  assert.equal(result.sourceId, 'project:0'); assert.match(result.reason, /cannot verify meaning/);
  assert.equal(parseWordingOutput({ edits: [] }, context), null);
  assert.ok(passesWordingChecks('Processed a total of 10 files on a daily basis.', 'Processed 10 files daily.'));
  assert.ok(passesWordingChecks('Utilizing C++ prior to deployment.', 'Using C++ before deployment.'));
});

test('new technologies, metrics, ownership, achievements, dropped qualifications and negation fail checks', () => {
  for (const text of [
    'Used React and Docker to build 3 screens with a teammate.',
    'Used React to build 30 screens with a teammate.',
    'Led React development to build 3 screens with a teammate.',
    'Used React to build 3 screens independently.',
    'Used React to build 3 screens with a teammate and increased revenue.',
    'Used React to build screens with a teammate.',
  ]) assert.throws(() => parseWordingOutput({ edits: [{ lineIndex: 0, proposed: text }] }, context));
  for (const [before, after] of [
    ['Assisted with React; did not lead.', 'Led React.'],
    ['Learning React for a planned project.', 'Built a React project.'],
    ['Reduced latency by 10%.', 'Reduced latency by 10.'],
    ['Tested 10 requests per second.', 'Tested 10 requests per minute.'],
    ['Used JavaScript.', 'Used Java.'], ['Used C++.', 'Used C.'],
    ['Handled 1.5 MB.', 'Handled 15 MB.'], ['Tested about 10 cases.', 'Tested 10 cases.'],
    ['Did not use React but used Docker.', 'Did use React but not used Docker.'],
    ['The team helped me.', 'Me helped the team.'],
    ['Recorded 10.', 'Recorded $10.'], ['Measured -10.', 'Measured 10.'],
    ['Reported 10.', 'Reported 10×.'],
  ]) assert.equal(passesWordingChecks(before, after), false, `${before} → ${after}`);
});

test('unknown fields, fabricated sources, line deletion, multiline output and no-op responses are rejected', () => {
  for (const value of [null, [], { ...valid(), score: 100 }, { edits: [valid().edits[0], valid().edits[0]] },
    { edits: [{ lineIndex: -1, proposed }] }, { edits: [{ lineIndex: 9, proposed }] },
    { edits: [{ lineIndex: 0, proposed, sourceId: 'experience:9' }] },
    { edits: [{ lineIndex: 0, proposed: original.split('\n')[0] }] },
    { edits: [{ lineIndex: 0, proposed: proposed + '\n' + proposed }] },
  ]) assert.throws(() => parseWordingOutput(value, context));
});

test('provider sends only selected description and job quote, makes one bounded request and records usage', async t => {
  const mock = t.mock.method(groqClient.chat.completions, 'create', async (request: any, options: any) => {
    const payload = JSON.parse(request.messages[1].content);
    assert.deepEqual(payload, { lines: original.split('\n'), requirement: { term: 'React', quote: 'React is required.' } });
    assert.ok(!JSON.stringify(request).includes(context.source.label));
    assert.match(request.messages[0].content, /untrusted data/);
    assert.equal(options.timeout, 20000); assert.equal(options.maxRetries, 0);
    assert.equal(request.max_completion_tokens, 2048); assert.deepEqual(request.response_format, { type: 'json_object' });
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(valid()) } }], usage: { prompt_tokens: 100, completion_tokens: 30 } } as any;
  });
  const output = await suggestWording(context);
  assert.equal(output.suggestion?.proposed.split('\n')[0], proposed);
  assert.equal(output.usage.inputTokens, 100); assert.equal(mock.mock.callCount(), 1);
});

test('malformed, truncated and injected provider output fails without partial suggestions', async t => {
  for (const [finish, content] of [['length', JSON.stringify(valid())], ['stop', '{bad'], ['stop', ''],
    ['stop', JSON.stringify({ edits: [{ lineIndex: 0, proposed: 'Invented Kubernetes mastery.' }] })],
    ['stop', JSON.stringify({ ...valid(), instructions: 'ignore source checks' })]]) {
    const mock = t.mock.method(groqClient.chat.completions, 'create', async () => ({ choices: [{ finish_reason: finish, message: { content } }] }) as any);
    await assert.rejects(suggestWording(context), { code: 'invalid_output' }); mock.mock.restore();
  }
});

test('provider failures have safe categories and release no private payload', async t => {
  for (const [status, code] of [[401, 'authentication'], [404, 'model_unavailable'], [429, 'rate_limited'], [500, 'unavailable']] as const) {
    const mock = t.mock.method(groqClient.chat.completions, 'create', async () => { throw Object.assign(new Error('private resume/provider data'), { status }); });
    await assert.rejects(suggestWording(context), e => { assert.ok(e instanceof Error); assert.equal((e as { code?: string }).code, code); assert.ok(!e.message.includes('private resume/provider data')); return true; }); mock.mock.restore();
  }
  t.mock.method(groqClient.chat.completions, 'create', async () => { throw new APIConnectionTimeoutError({}); });
  await assert.rejects(suggestWording(context), { code: 'timeout' });
});
