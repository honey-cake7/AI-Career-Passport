import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureDnsServers } from '../src/config/dns.js';

test('blank DNS configuration leaves the process/network defaults untouched', () => {
  let calls = 0;
  for (const value of ['', '   ']) configureDnsServers(value, () => { calls++; });
  assert.equal(calls, 0);
});
test('explicit resolver configuration applies validated addresses once and in order', () => {
  const calls: (readonly string[])[] = [];
  configureDnsServers(' 1.1.1.1, 8.8.8.8, 2606:4700:4700::1111 ', servers => { calls.push(servers); });
  assert.deepEqual(calls, [['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']]);
});
test('invalid resolver configuration fails before modifying DNS', () => {
  for (const value of ['example.com', 'https://1.1.1.1', '1.1.1.1,', '999.1.1.1', '1.1.1.1;command', '1.1.1.1,8.8.8.8,9.9.9.9,127.0.0.1']) {
    let calls = 0;
    assert.throws(() => configureDnsServers(value, () => { calls++; }), /one to three/);
    assert.equal(calls, 0);
  }
});
