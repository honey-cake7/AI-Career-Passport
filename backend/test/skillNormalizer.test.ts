import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groqClient } from '../src/config/groq.js';
import { extractRawSkills, selectCanonicalSkills } from '../src/services/skillNormalizer.service.js';

test('skill extraction requests valid JSON and accepts a skills object', async (t) => {
  let request: any;
  t.mock.method(groqClient.chat.completions, 'create', async (input: any) => {
    request = input;
    return {
      choices: [{ finish_reason: 'stop', message: { content: '{"skills":[" React.js ","TypeScript","React.js",4]}' } }],
    } as any;
  });

  assert.deepEqual(await extractRawSkills('React.js and TypeScript'), ['React.js', 'TypeScript']);
  assert.deepEqual(request.response_format, { type: 'json_object' });
  assert.equal(request.max_completion_tokens, 4096);
  if (request.model.startsWith('openai/gpt-oss-')) {
    assert.equal(request.reasoning_effort, 'low');
    assert.equal(request.include_reasoning, false);
  }
});

test('skill extraction reports output truncation without parsing partial JSON', async (t) => {
  t.mock.method(groqClient.chat.completions, 'create', async () => ({
    choices: [{ finish_reason: 'length', message: { content: '{"skills":["TypeScript"' } }],
  } as any));

  await assert.rejects(extractRawSkills('TypeScript'), /output token limit/);
});

test('48 ambiguous skills use one bounded Groq call instead of 48 calls', async t => {
  const raw = Array.from({ length: 48 }, (_, i) => `raw-${i}`);
  const matches = raw.map((_, i) => [{ skill: `Canonical ${i}`, score: 0.8 }]);
  const mock = t.mock.method(groqClient.chat.completions, 'create', async (input: any, options: any) => {
    assert.equal(input.max_completion_tokens, 4096);
    assert.equal(input.reasoning_effort, 'low');
    assert.equal(input.include_reasoning, false);
    assert.equal(options.maxRetries, 0);
    assert.equal(options.timeout, 20_000);
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      matches: raw.map((_, index) => ({ index, canonical: `Canonical ${index}` })),
    }) } }] } as any;
  });
  const result = await selectCanonicalSkills(raw, matches);
  assert.equal(result.length, 48);
  assert.equal(mock.mock.callCount(), 1);
});

test('exact candidate names skip Groq without using cosine similarity as proof of equivalence', async t => {
  const mock = t.mock.method(groqClient.chat.completions, 'create', async () => { throw Error('Unexpected call'); });
  assert.deepEqual(await selectCanonicalSkills(['react.js', 'React.js'], [
    [{ skill: 'React.js', score: 0.7 }], [{ skill: 'React.js', score: 0.99 }],
  ]), ['React.js']);
  assert.equal(mock.mock.callCount(), 0);
});

test('null explicitly means no equivalent taxonomy candidate', async t => {
  t.mock.method(groqClient.chat.completions, 'create', async () => ({
    choices: [{ finish_reason: 'stop', message: { content: '{"matches":[{"index":0,"canonical":null}]}' } }],
  } as any));
  assert.deepEqual(await selectCanonicalSkills(['unlisted skill'], [[{ skill: 'React.js', score: 0.1 }]]), []);
});

test('batch normalization rejects a token-limited completion even if its JSON parses', async t => {
  t.mock.method(groqClient.chat.completions, 'create', async () => ({
    choices: [{ finish_reason: 'length', message: { content: '{"matches":[{"index":0,"canonical":"React.js"}]}' } }],
  } as any));
  await assert.rejects(selectCanonicalSkills(['reactjs'], [[{ skill: 'React.js', score: 0.8 }]]), {
    name: 'SkillPipelineError', stage: 'canonicalization',
  });
});

for (const [name, content] of [
  ['invented name', '{"matches":[{"index":0,"canonical":"Invented"},{"index":1,"canonical":null}]}'],
  ['duplicate index', '{"matches":[{"index":0,"canonical":"React.js"},{"index":0,"canonical":"React.js"}]}'],
  ['missing item', '{"matches":[{"index":0,"canonical":"React.js"}]}'],
  ['wrong index', '{"matches":[{"index":0,"canonical":"React.js"},{"index":9,"canonical":null}]}'],
  ['malformed JSON', '{"matches":'],
]) {
  test(`batch selection rejects ${name} instead of returning a partial success`, async t => {
    t.mock.method(groqClient.chat.completions, 'create', async () => ({
      choices: [{ finish_reason: 'stop', message: { content } }],
    } as any));
    await assert.rejects(selectCanonicalSkills(['reactjs', 'nodejs'], [
      [{ skill: 'React.js', score: 0.8 }], [{ skill: 'Node.js', score: 0.8 }],
    ]), { name: 'SkillPipelineError', stage: 'canonicalization' });
  });
}
