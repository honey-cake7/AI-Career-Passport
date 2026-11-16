import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groqClient } from '../src/config/groq.js';
import { extractRawSkills } from '../src/services/skillNormalizer.service.js';

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
