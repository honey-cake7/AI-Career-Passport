import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

test('successful connection never logs the connection string', async t => {
  const output: unknown[][] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { output.push(args); });
  t.mock.method(mongoose, 'connect', async () => mongoose);
  await connectDatabase();
  const logs = JSON.stringify(output);
  assert.ok(logs.includes('database_connected'));
  assert.equal(logs.includes(process.env.MONGODB_URI!), false);
  assert.equal(logs.includes('mongodb://'), false);
});

test('connection retries never log driver errors or their sensitive details', async t => {
  const output: unknown[][] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { output.push(args); });
  t.mock.method(console, 'error', (...args: unknown[]) => { output.push(args); });
  // Exercise retry behavior without spending twenty seconds on real timers.
  t.mock.method(globalThis, 'setTimeout', (callback: () => void) => {
    queueMicrotask(callback);
    return {} as ReturnType<typeof setTimeout>;
  });
  const connect = t.mock.method(mongoose, 'connect', async () => { throw Error('sensitive driver details'); });
  await assert.rejects(connectDatabase(), /Failed to connect to MongoDB after 5 attempts/);
  const logs = JSON.stringify(output);
  assert.equal(connect.mock.callCount(), 5);
  assert.ok(logs.includes('database_connection_failed'));
  assert.equal(logs.includes('sensitive driver details'), false);
  assert.equal(logs.includes(process.env.MONGODB_URI!), false);
});

test('disconnect failure never prints the raw driver error', async t => {
  const output: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { output.push(args); });
  t.mock.method(mongoose, 'disconnect', async () => { throw Error('sensitive driver details'); });
  await disconnectDatabase();
  assert.deepEqual(output, [['database_disconnect_failed']]);
});
