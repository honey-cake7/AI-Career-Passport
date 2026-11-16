// Manual real-model smoke check; never contact live database/provider accounts.
import '../setup.mjs';
import '../../dist/app.js';
import { embeddingService } from '../../dist/services/embedding.service.js';

const samples = ['React.js', 'TypeScript', 'Node.js', 'Express.js', 'MongoDB', 'Docker', 'GitHub Actions', 'REST API'];
const texts = Array.from({ length: 48 }, (_, index) => samples[index % samples.length]);
const started = performance.now();
const baselineMb = process.memoryUsage().rss / 1024 / 1024;
const vectors = await embeddingService.generateEmbeddings(texts);
if (vectors.length !== 48 || vectors.some(vector => vector.length !== 384 || vector.some(value => !Number.isFinite(value)))) {
  throw new Error('Embedding smoke check failed');
}
console.log(JSON.stringify({
  workload: '48 synthetic skill names; app modules loaded; no live database or LLM calls',
  elapsedMs: Math.round(performance.now() - started),
  baselineRssMb: Math.round(baselineMb),
  finalRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  processPeakRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
}));
process.exit(0);
