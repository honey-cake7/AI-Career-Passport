import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import PDFDocument from 'pdfkit';
import app from '../src/app.js';
import { Profile } from '../src/models/Profile.js';
import { groqClient } from '../src/config/groq.js';
import { embeddingService } from '../src/services/embedding.service.js';
import { qdrantClient } from '../src/config/qdrant.js';

async function syntheticPdf(): Promise<Buffer> {
  const pdf = new PDFDocument();
  const chunks: Buffer[] = [];
  pdf.on('data', chunk => chunks.push(chunk));
  const done = once(pdf, 'end');
  pdf.text('Synthetic Candidate\nProject: small React.js dashboard.');
  pdf.end();
  await done;
  return Buffer.concat(chunks);
}

for (const unavailable of [true, false]) {
test(unavailable ? 'real PDF upload returns safe 503 on taxonomy failure without saving' : 'real PDF upload saves canonical skills and preserves its response contract', async t => {
  const extractorResult = { personalInfo: { fullName: 'Synthetic Candidate' }, experiences: [], education: [], projects: [] };
  let calls = 0;
  t.mock.method(groqClient.chat.completions, 'create', async () => ({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(++calls === 1 ? extractorResult : { skills: ['React.js'] }) } }],
  } as any));
  t.mock.method(embeddingService, 'generateEmbeddings', async () => [Array(384).fill(0.1)]);
  t.mock.method(qdrantClient, 'queryBatch', async () => {
    if (unavailable) throw Error('private dependency details');
    return [{ points: [{ score: 0.8, payload: { skill_name: 'React.js' } }] }] as any;
  });
  const persistence = t.mock.method(Profile, 'findOneAndUpdate', async (_filter: unknown, update: any) => {
    assert.deepEqual(update.skills, ['React.js']);
    return { ...update, _id: '507f1f77bcf86cd799439012', slug: 'synthetic' } as any;
  });

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const form = new FormData();
    form.set('userId', '507f1f77bcf86cd799439011');
    form.set('resume', new Blob([new Uint8Array(await syntheticPdf())], { type: 'application/pdf' }), 'synthetic.pdf');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/profile/upload`, {
      method: 'POST', body: form, signal: AbortSignal.timeout(10_000),
    });
    const body: any = await response.json();
    if (unavailable) {
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('Retry-After'), '30');
      assert.equal(body.code, 'SKILL_PIPELINE_UNAVAILABLE');
      assert.equal(body.stage, 'qdrant');
      assert.equal(JSON.stringify(body).includes('private dependency details'), false);
      assert.equal(persistence.mock.callCount(), 0);
    } else {
      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.deepEqual(body.data.skills, ['React.js']);
      assert.equal(persistence.mock.callCount(), 1);
    }
    assert.equal(calls, 2);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
}
