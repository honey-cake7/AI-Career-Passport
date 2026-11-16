import { EmbeddingModel, FlagEmbedding } from 'fastembed';
import { SkillPipelineError } from '../utils/skillPipeline.js';

/**
 * Singleton embedding service backed by fastembed (ONNX runtime, local inference).
 * Uses the BGESmallEN model which produces 384-dimensional vectors.
 */
export class EmbeddingService {
  private model: FlagEmbedding | null = null;
  private initPromise: Promise<FlagEmbedding> | null = null;
  private inferenceInProgress = false;

  /**
   * Lazily initializes the embedding model. Thread-safe via promise caching.
   */
  private async getModel(): Promise<FlagEmbedding> {
    if (this.model) return this.model;

    // Prevent multiple concurrent initializations
    if (!this.initPromise) {
      console.log('embedding_model_loading');
      this.initPromise = FlagEmbedding.init({
        model: EmbeddingModel.BGESmallENV15,
        // Inputs are short skill names, not resume passages. Padding to the SDK's
        // 512-token default wastes substantial memory during attention/output allocation.
        maxLength: 64,
        cacheDir: process.env.FASTEMBED_CACHE_DIR || 'local_cache',
        showDownloadProgress: false,
      }).then((m) => {
        this.model = m;
        console.log('🧠 Embedding model (BGESmallEN v1.5) initialized');
        return m;
      }).catch(() => {
        // A rejected initialization must not poison every later upload until restart.
        this.initPromise = null;
        console.warn('embedding_model_initialization_failed');
        throw new Error('Embedding model initialization failed');
      });
    }

    return this.initPromise;
  }

  /**
   * Generate an embedding vector for a single text string.
   *
   * @param text - The text to embed
   * @returns A 384-dimensional number array
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const [vector] = await this.generateEmbeddings([text], 1);
    if (!vector) throw new Error('Failed to generate embedding: no output produced');
    return vector;
  }

  /**
   * Generate embedding vectors for multiple texts in batches.
   *
   * @param texts - Array of texts to embed
   * @param batchSize - Requested batch size; capped at one for memory-limited hosts.
   * @returns Array of 384-dimensional number arrays
   */
  async generateEmbeddings(texts: string[], batchSize = 1, signal?: AbortSignal): Promise<number[][]> {
    if (!texts.length) return [];
    if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('Invalid embedding batch size');
    signal?.throwIfAborted();
    const model = await this.getModel();
    // FastEmbed initialization has no abort API. It stays shared while loading;
    // expired uploads must not start inference when that initialization completes.
    signal?.throwIfAborted();
    // Native inference allocations are outside V8's heap limit. Concurrent uploads
    // must not each allocate an ONNX workload on a 512 MB instance; reject rather
    // than build an unbounded queue. Release only after native work actually settles.
    if (this.inferenceInProgress) throw new SkillPipelineError('embedding', 'busy');
    this.inferenceInProgress = true;
    try {
      const results: number[][] = [];
      const embeddings = model.embed(texts, Math.min(batchSize, 1));
      console.log(`embedding_inference_started count=${texts.length} max_length=64 batch_size=1 rss_mb=${Math.round(process.memoryUsage().rss / 1024 / 1024)}`);
      for await (const batch of embeddings) {
        signal?.throwIfAborted();
        for (const vec of batch) results.push(Array.from(vec));
        if (results.length % 16 === 0 || results.length === texts.length) {
          console.log(`embedding_progress completed=${results.length} total=${texts.length} rss_mb=${Math.round(process.memoryUsage().rss / 1024 / 1024)}`);
        }
      }
      return results;
    } finally {
      this.inferenceInProgress = false;
    }
  }
}

/** Singleton instance */
export const embeddingService = new EmbeddingService();
