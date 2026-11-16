import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FlagEmbedding } from 'fastembed';
import { EmbeddingService, embeddingService } from '../src/services/embedding.service.js';
import { qdrantClient } from '../src/config/qdrant.js';
import { findSimilarSkillsBatch } from '../src/services/vectorSearch.service.js';
import { runSkillStage } from '../src/utils/skillPipeline.js';

for (const stage of ['embedding', 'qdrant', 'canonicalization'] as const) {
test(`a stalled ${stage} dependency times out and receives cancellation`, { timeout: 1000 }, async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(runSkillStage(stage, 10, async input => {
    signal = input;
    return new Promise<never>(() => {});
  }), { name: 'SkillPipelineError', stage, code: 'timeout' });
  assert.equal(signal?.aborted, true);
});
}

test('dependency errors are redacted and cannot silently become an empty skills list', async () => {
  await assert.rejects(runSkillStage('qdrant', 1000, async () => {
    throw new Error('private provider payload');
  }), error => error instanceof Error && !error.message.includes('private provider payload') && error.name === 'SkillPipelineError');
});

test('48 skills use a single embedding pass and a single Qdrant batch request', async t => {
  const skills = Array.from({ length: 48 }, (_, i) => `skill-${i}`);
  const embed = t.mock.method(embeddingService, 'generateEmbeddings', async (texts: string[], batchSize?: number, signal?: AbortSignal) => {
    assert.deepEqual(texts, skills);
    assert.equal(batchSize, 8);
    assert.equal(signal?.aborted, false);
    return texts.map(() => Array(384).fill(0.1));
  });
  const search = t.mock.method(qdrantClient, 'queryBatch', async (_collection: string, request: Parameters<typeof qdrantClient.queryBatch>[1]) => {
    assert.equal(request.searches.length, 48);
    assert.equal(request.timeout, 8);
    return skills.map(skill => ({ points: [{ score: 0.8, payload: { skill_name: skill } }] })) as any;
  });
  const result = await findSimilarSkillsBatch(skills);
  assert.equal(result.length, 48);
  assert.equal(result[47][0].skill, 'skill-47');
  assert.equal(embed.mock.callCount(), 1);
  assert.equal(search.mock.callCount(), 1);
});

test('an empty taxonomy fails explicitly instead of discarding every skill', async t => {
  t.mock.method(embeddingService, 'generateEmbeddings', async () => [Array(384).fill(0.1)]);
  t.mock.method(qdrantClient, 'queryBatch', async () => [{ points: [] }]);
  await assert.rejects(findSimilarSkillsBatch(['React']), { name: 'SkillPipelineError', stage: 'qdrant' });
});

test('failed initialization can retry and concurrent calls share initialization', async t => {
  const service = new EmbeddingService();
  let attempts = 0;
  const mock = t.mock.method(FlagEmbedding, 'init', async () => {
    attempts++;
    if (attempts === 1) throw Error('synthetic download failure');
    return { async *embed(texts: string[]) { yield texts.map(() => [1, 2, 3]); } } as any;
  });
  await assert.rejects(service.generateEmbedding('synthetic'));
  assert.deepEqual(await Promise.all([service.generateEmbedding('a'), service.generateEmbedding('b')]), [[1, 2, 3], [1, 2, 3]]);
  assert.equal(mock.mock.callCount(), 2);
});

test('an upload canceled while the shared model loads does not start late inference', async t => {
  const service = new EmbeddingService();
  let finish!: (model: any) => void;
  let inferenceCalls = 0;
  t.mock.method(FlagEmbedding, 'init', () => new Promise(resolve => { finish = resolve; }) as any);
  const controller = new AbortController();
  const result = service.generateEmbeddings(['synthetic'], 1, controller.signal);
  controller.abort();
  finish({ async *embed() { inferenceCalls++; yield [[1]]; } });
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(inferenceCalls, 0);
});
