import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySkillReviews, skillSnapshot, withSkillReview, normalizationProvider } from '../src/services/skillReview.js';

function snapshot() {
  const result = skillSnapshot(['reactjs', 'New tool', 'SQL']);
  Object.assign(result.entries[0], { suggestion: 'React.js', method: 'model' });
  return result;
}

test('review decisions preserve raw provenance and accept only server-offered suggestions', () => {
  const original = snapshot();
  const next = applySkillReviews(original, [
    { id: 'skill:0', choice: 'suggested' }, { id: 'skill:1', choice: 'original' },
    { id: 'skill:2', choice: 'custom', value: 'SQL databases' },
  ], ['React.js', 'New tool', 'SQL databases', 'Manual addition'])!;
  assert.deepEqual(next.entries.map(entry => entry.value), ['React.js', 'New tool', 'SQL databases']);
  assert.deepEqual(next.entries.map(entry => entry.raw), ['reactjs', 'New tool', 'SQL']);
  assert.equal(next.entries[0].suggestion, 'React.js');
  assert.equal(original.entries[0].choice, 'pending');
  assert.equal(applySkillReviews(original, undefined, []), original);
});

for (const decisions of [
  [{ id: 'unknown', choice: 'original' }], [{ id: 'skill:1', choice: 'suggested' }],
  [{ id: 'skill:0', choice: 'suggested', value: 'Invented' }],
  [{ id: 'skill:0', choice: 'original', suggestion: 'Invented' }],
  [{ id: 'skill:0', choice: 'original' }, { id: 'skill:0', choice: 'custom', value: 'New' }],
  [{ id: 'skill:0', choice: 'pending' }], [{ id: 'skill:0', choice: 'custom', value: 'a\nb' }],
  [{ id: 'skill:0', choice: 'custom', value: 'x'.repeat(101) }],
  [{ id: 'skill:0', choice: 'custom', value: '' }],
]) {
  test(`invalid skill review is rejected: ${JSON.stringify(decisions).slice(0, 85)}`, () => {
    assert.throws(() => applySkillReviews(snapshot(), decisions, ['reactjs', 'New', 'New tool', 'a\nb', 'x'.repeat(101)]));
  });
}

test('new choices must appear in saved content; old choices do not prevent manual removal', () => {
  assert.throws(() => applySkillReviews(snapshot(), [{ id: 'skill:0', choice: 'suggested' }], ['reactjs']));
  assert.throws(() => applySkillReviews(undefined, [{ id: 'skill:0', choice: 'original' }], ['reactjs']));
  const chosen = applySkillReviews(snapshot(), [{ id: 'skill:0', choice: 'suggested' }], ['React.js'])!;
  assert.equal(applySkillReviews(chosen, undefined, [])?.entries[0].value, 'React.js');
});

test('normalization admission is per account and always releases after a failed request', async () => {
  let release!: () => void;
  const pending = withSkillReview('synthetic-owner', () => new Promise<void>(resolve => { release = resolve; }));
  assert.equal(await withSkillReview('synthetic-owner', async () => 'unexpected'), null);
  assert.equal(await withSkillReview('another-owner', async () => 'allowed'), 'allowed');
  release(); await pending;
  await assert.rejects(withSkillReview('synthetic-owner', async () => { throw Error('synthetic'); }));
  assert.equal(await withSkillReview('synthetic-owner', async () => 'recovered'), 'recovered');
});

test('missing AI configuration leaves saved skill names reviewable without importing native models', async () => {
  const previous = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    const result = await normalizationProvider(['React.js']);
    assert.equal(result.status, 'unavailable'); assert.equal(result.entries[0].value, 'React.js');
  } finally { if (previous !== undefined) process.env.GROQ_API_KEY = previous; }
});
