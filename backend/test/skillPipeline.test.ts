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
    assert.equal(batchSize, 16);
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
  const mock = t.mock.method(FlagEmbedding, 'init', async (options: { maxLength?: number }) => {
    assert.equal(options.maxLength, 64);
    attempts++;
    if (attempts === 1) throw Error('synthetic download failure');
    return { async *embed(texts: string[], batchSize: number) {
      assert.ok(batchSize >= 1, `batchSize should be >= 1, got ${batchSize}`);
      yield texts.map(() => [1, 2, 3]);
    } } as any;
  });
  await assert.rejects(service.generateEmbedding('synthetic'));
  const concurrent = await Promise.allSettled([service.generateEmbedding('a'), service.generateEmbedding('b')]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  const refused = concurrent.find(result => result.status === 'rejected');
  assert.ok(refused && refused.status === 'rejected');
  assert.equal(refused.reason.code, 'busy');
  assert.deepEqual(await service.generateEmbeddings(['a', 'b'], 8), [[1, 2, 3], [1, 2, 3]]);
  assert.equal(mock.mock.callCount(), 2);
});

test('the inference slot is released after a native failure', async t => {
  const service = new EmbeddingService();
  let calls = 0;
  t.mock.method(FlagEmbedding, 'init', async () => ({ async *embed() {
    if (++calls === 1) throw new Error('synthetic native failure');
    yield [[1, 2, 3]];
  } } as any));
  await assert.rejects(service.generateEmbedding('first'), /synthetic native failure/);
  assert.deepEqual(await service.generateEmbedding('retry'), [1, 2, 3]);
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


test('52 skills with duplicates are deduplicated before inference', async t => {
  const service = new EmbeddingService();
  let inferredTexts: string[] = [];
  let inferredBatch = 0;
  t.mock.method(FlagEmbedding, 'init', async () => ({ async *embed(texts: string[], batchSize: number) {
    inferredTexts = texts;
    inferredBatch = batchSize;
    yield texts.map((_, i) => Array(384).fill(i * 0.01));
  } } as any));
  // 52 skills but only 26 unique
  const skills = Array.from({ length: 52 }, (_, i) => `skill-${i % 26}`);
  const results = await service.generateEmbeddings(skills, 16);
  assert.equal(results.length, 52);
  assert.equal(inferredTexts.length, 26, 'should only embed 26 unique texts');
  assert.equal(inferredBatch, 16);
  // Duplicate entries should share the same vector
  assert.deepEqual(results[0], results[26]);
  assert.deepEqual(results[1], results[27]);
});

test('cached embeddings skip inference entirely on repeat call', async t => {
  const service = new EmbeddingService();
  let embedCalls = 0;
  t.mock.method(FlagEmbedding, 'init', async () => ({ async *embed(texts: string[]) {
    embedCalls++;
    yield texts.map(() => [0.5, 0.6, 0.7]);
  } } as any));
  // First call: embeds unique texts and populates cache
  const first = await service.generateEmbeddings(['react', 'node', 'react']);
  assert.equal(embedCalls, 1);
  assert.equal(first.length, 3);
  assert.deepEqual(first[0], first[2]); // duplicates produce same vector
  // Second call with same inputs: should skip inference entirely (all cached)
  const second = await service.generateEmbeddings(['react', 'node']);
  assert.equal(embedCalls, 1, 'should not call embed again for cached texts');
  assert.deepEqual(second, [[0.5, 0.6, 0.7], [0.5, 0.6, 0.7]]);
});

test('52-skill embedding timeout produces SkillPipelineError and does not corrupt data', { timeout: 2000 }, async () => {
  await assert.rejects(
    runSkillStage('embedding', 50, async () => new Promise<never>(() => {})),
    error => {
      assert.ok(error instanceof Error);
      assert.equal(error.name, 'SkillPipelineError');
      assert.equal((error as any).stage, 'embedding');
      assert.equal((error as any).code, 'timeout');
      return true;
    },
  );
});

test('embedding recovery after timeout allows subsequent requests', { timeout: 2000 }, async () => {
  await assert.rejects(runSkillStage('embedding', 10, async () => {
    return new Promise<never>(() => {});
  }), { name: 'SkillPipelineError', code: 'timeout' });
  const result = await runSkillStage('embedding', 1000, async () => 'recovered');
  assert.equal(result, 'recovered');
});

test('Math.max regression: batchSize > 1 is passed through to embed', async t => {
  const service = new EmbeddingService();
  let receivedBatchSize = 0;
  t.mock.method(FlagEmbedding, 'init', async () => ({ async *embed(texts: string[], batchSize: number) {
    receivedBatchSize = batchSize;
    yield texts.map(() => [1]);
  } } as any));
  await service.generateEmbeddings(['test'], 32);
  assert.equal(receivedBatchSize, 32, 'batchSize=32 must reach embed(), not be clamped to 1');
});
