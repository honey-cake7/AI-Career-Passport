import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groqClient } from '../src/config/groq.js';
import { extractRawSkills, selectCanonicalSkills, normalizeRawSkills } from '../src/services/skillNormalizer.service.js';
import { embeddingService } from '../src/services/embedding.service.js';
import { qdrantClient } from '../src/config/qdrant.js';

test('skill extraction requests valid JSON and accepts a skills object', async (t) => {
  let request: any;
  t.mock.method(groqClient.chat.completions, 'create', async (input: any) => {
    request = input;
    return {
      choices: [{ finish_reason: 'stop', message: { content: '{"skills":[" React.js ","TypeScript","React.js"]}' } }],
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
  assert.equal(result.entries.length, 48);
  assert.equal(result.entries[47].raw, 'raw-47');
  assert.equal(result.entries[47].suggestion, 'Canonical 47');
  assert.ok(result.entries.every(entry => entry.choice === 'pending' && entry.value === entry.raw));
  assert.equal(mock.mock.callCount(), 1);
});

test('exact candidate names skip Groq without using cosine similarity as proof of equivalence', async t => {
  const mock = t.mock.method(groqClient.chat.completions, 'create', async () => { throw Error('Unexpected call'); });
  const result = await selectCanonicalSkills(['react.js', 'React.js'], [
    [{ skill: 'React.js', score: 0.7 }], [{ skill: 'React.js', score: 0.99 }],
  ]);
  assert.deepEqual(result.entries.map(entry => [entry.raw, entry.suggestion, entry.method, entry.value]), [
    ['react.js', 'React.js', 'exact', 'react.js'], ['React.js', 'React.js', 'exact', 'React.js'],
  ]);
  assert.equal(mock.mock.callCount(), 0);
});

test('null explicitly means no equivalent taxonomy candidate', async t => {
  t.mock.method(groqClient.chat.completions, 'create', async () => ({
    choices: [{ finish_reason: 'stop', message: { content: '{"matches":[{"index":0,"canonical":null}]}' } }],
  } as any));
  const result = await selectCanonicalSkills(['unlisted skill'], [[{ skill: 'React.js', score: 0.1 }]]);
  assert.deepEqual(result.entries, [{ id: 'skill:0', raw: 'unlisted skill', suggestion: null, method: 'unresolved', choice: 'pending', value: 'unlisted skill' }]);
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
  ['unknown fields', '{"matches":[{"index":0,"canonical":"React.js","confidence":100},{"index":1,"canonical":null}]}'],
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

for (const content of ['{"skills":[4]}', '{"skills":[""]}', '{"skills":["a\\nb"]}', '{"skills":["React"],"extra":true}', JSON.stringify({ skills: ['x'.repeat(101)] })]) {
  test(`skill extraction rejects invalid structured data: ${content.slice(0, 35)}`, async t => {
    t.mock.method(groqClient.chat.completions, 'create', async () => ({ choices: [{ finish_reason: 'stop', message: { content } }] }) as any);
    await assert.rejects(extractRawSkills('Synthetic source'));
  });
}

test('empty candidates preserve raw skills without calling the model', async t => {
  const mock = t.mock.method(groqClient.chat.completions, 'create', async () => { throw Error('Unexpected'); });
  const result = await selectCanonicalSkills(['New tool'], [[]]);
  assert.equal(result.entries[0].value, 'New tool');
  assert.equal(result.entries[0].suggestion, null);
  assert.equal(mock.mock.callCount(), 0);
});

test('embedding failure preserves every original skill and marks suggestions unavailable', async t => {
  t.mock.method(embeddingService, 'generateEmbeddings', async () => { throw Error('private payload'); });
  const search = t.mock.method(qdrantClient, 'queryBatch', async () => { throw Error('Unexpected'); });
  const result = await normalizeRawSkills(['reactjs', 'Unlisted skill']);
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.entries.map(entry => entry.raw), ['reactjs', 'Unlisted skill']);
  assert.ok(result.entries.every(entry => entry.suggestion === null));
  assert.equal(search.mock.callCount(), 0);
});

test('malformed selection discards all suggestions while keeping raw skills', async t => {
  t.mock.method(embeddingService, 'generateEmbeddings', async () => [Array(384).fill(0.1)]);
  t.mock.method(qdrantClient, 'queryBatch', async () => [{ points: [{ score: 0.8, payload: { skill_name: 'React.js' } }] }] as any);
  t.mock.method(groqClient.chat.completions, 'create', async () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"matches":[]}' } }] }) as any);
  const result = await normalizeRawSkills(['reactjs']);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.entries[0].value, 'reactjs');
  assert.equal(result.entries[0].suggestion, null);
});
