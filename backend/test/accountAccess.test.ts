import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withAccountLock } from '../src/security/accountAccess.js';
import { parseDeletionRequest } from '../src/services/accountDeletion.js';
import { ResumeInputError } from '../src/validation/resume.js';

test('deletion confirmation rejects supplied ownership, unknown fields and invalid passwords without trimming', () => {
  const valid = { password: '  synthetic password  ', confirmation: 'DELETE' };
  assert.equal(parseDeletionRequest(valid).password, valid.password);
  for (const input of [undefined, [], {}, { ...valid, userId: 'other' }, { ...valid, email: 'other@example.invalid' }, { ...valid, confirmation: 'delete' }, { ...valid, confirmation: ['DELETE'] }, { ...valid, password: ['synthetic password'] }, { ...valid, password: 'short' }, { ...valid, password: 'x'.repeat(129) }]) {
    assert.throws(() => parseDeletionRequest(input), ResumeInputError);
  }
});
test('account mutations serialize for one owner while another owner remains independent', async () => {
  let enter!: () => void; let release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const order: string[] = [];
  const first = withAccountLock('owner-a', async () => { order.push('first'); enter(); await gate; order.push('first done'); });
  await entered;
  const second = withAccountLock('owner-a', async () => { order.push('second'); });
  await withAccountLock('owner-b', async () => { order.push('other owner'); });
  assert.deepEqual(order, ['first', 'other owner']);
  release(); await Promise.all([first, second]);
  assert.deepEqual(order, ['first', 'other owner', 'first done', 'second']);
});
test('a failed mutation releases its account lock for a later retry', async () => {
  await assert.rejects(withAccountLock('failed-owner', async () => { throw new Error('synthetic failure'); }));
  assert.equal(await withAccountLock('failed-owner', async () => 'recovered'), 'recovered');
});
