import { embeddingService } from '../services/embedding.service.js';
import { runSkillStage } from '../utils/skillPipeline.js';

// Populate the same cache used at runtime. No resume, Groq key, or database is needed.
try {
  const vectors = await runSkillStage('embedding', 120_000, signal =>
    embeddingService.generateEmbeddings(['embedding model readiness check'], 1, signal));
  if (vectors[0]?.length !== 384 || vectors[0].some(value => !Number.isFinite(value))) {
    throw new Error('Invalid model output');
  }
  console.log('embedding_cache_ready dimensions=384');
  process.exit(0);
} catch {
  console.error('embedding_cache_prepare_failed');
  // FastEmbed downloads cannot be cancelled; a failed build must terminate them.
  process.exit(1);
}
