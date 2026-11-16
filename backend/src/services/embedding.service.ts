import { EmbeddingModel, FlagEmbedding } from 'fastembed';
import { SkillPipelineError } from '../utils/skillPipeline.js';

const CACHE_MAX_SIZE = 2000;

/**
 * Singleton embedding service backed by fastembed (ONNX runtime, local inference).
 * Uses the BGESmallEN model which produces 384-dimensional vectors.
 */
export class EmbeddingService {
  private model: FlagEmbedding | null = null;
  private initPromise: Promise<FlagEmbedding> | null = null;
  private inferenceInProgress = false;
  private cache = new Map<string, number[]>();

  /**
   * Lazily initializes the embedding model. Thread-safe via promise caching.
   */
  private async getModel(): Promise<FlagEmbedding> {
    if (this.model) return this.model;

    // Prevent multiple concurrent initializations
    if (!this.initPromise) {
      const initStart = performance.now();
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
        console.log(`embedding_model_initialized duration_ms=${Math.round(performance.now() - initStart)}`);
        return m;
      }).catch(() => {
        // A rejected initialization must not poison every later upload until restart.
        this.initPromise = null;
        console.warn(`embedding_model_initialization_failed duration_ms=${Math.round(performance.now() - initStart)}`);
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
    const [vector] = await this.generateEmbeddings([text], 16);
    if (!vector) throw new Error('Failed to generate embedding: no output produced');
    return vector;
  }

  /**
   * Generate embedding vectors for multiple texts in batches.
   * Deduplicates identical texts and caches results for the process lifetime.
   *
   * @param texts - Array of texts to embed
   * @param batchSize - Number of texts per ONNX inference batch (default 16).
   * @returns Array of 384-dimensional number arrays
   */
  async generateEmbeddings(texts: string[], batchSize = 16, signal?: AbortSignal): Promise<number[][]> {
    if (!texts.length) return [];
    if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('Invalid embedding batch size');
    signal?.throwIfAborted();
    const model = await this.getModel();
    // FastEmbed initialization has no abort API. It stays shared while loading;
    // expired uploads must not start inference when that initialization completes.
    signal?.throwIfAborted();

    // ── Deduplicate: only embed texts we haven't seen before ──
    const uniqueMap = new Map<string, number>(); // text → index in uniqueTexts
    const uniqueTexts: string[] = [];
    for (const text of texts) {
      if (!uniqueMap.has(text) && !this.cache.has(text)) {
        uniqueMap.set(text, uniqueTexts.length);
        uniqueTexts.push(text);
      }
    }

    // If all texts are cached, skip inference entirely
    if (uniqueTexts.length === 0) {
      console.log(`embedding_cache_hit count=${texts.length} all_cached=true`);
      return texts.map(text => this.cache.get(text)!);
    }

    // Native inference allocations are outside V8's heap limit. Concurrent uploads
    // must not each allocate an ONNX workload on a 512 MB instance; reject rather
    // than build an unbounded queue. Release only after native work actually settles.
    if (this.inferenceInProgress) throw new SkillPipelineError('embedding', 'busy');
    this.inferenceInProgress = true;
    try {
      const effectiveBatch = Math.max(batchSize, 1);
      const uniqueResults: number[][] = [];
      const inferenceStart = performance.now();
      const embeddings = model.embed(uniqueTexts, effectiveBatch);
      console.log(`embedding_inference_started count=${uniqueTexts.length} total=${texts.length} deduplicated=${texts.length - uniqueTexts.length} batch_size=${effectiveBatch} rss_mb=${Math.round(process.memoryUsage().rss / 1024 / 1024)}`);
      for await (const batch of embeddings) {
        signal?.throwIfAborted();
        for (const vec of batch) uniqueResults.push(Array.from(vec));
        if (uniqueResults.length % 16 === 0 || uniqueResults.length === uniqueTexts.length) {
          console.log(`embedding_progress completed=${uniqueResults.length} total=${uniqueTexts.length} rss_mb=${Math.round(process.memoryUsage().rss / 1024 / 1024)}`);
        }
      }
      console.log(`embedding_inference_complete count=${uniqueResults.length} duration_ms=${Math.round(performance.now() - inferenceStart)}`);

      // ── Populate cache ──
      if (this.cache.size + uniqueTexts.length > CACHE_MAX_SIZE) {
        this.cache.clear();
      }
      for (let i = 0; i < uniqueTexts.length; i++) {
        this.cache.set(uniqueTexts[i], uniqueResults[i]);
      }

      // ── Map results back to original order (including duplicates) ──
      return texts.map(text => {
        const cached = this.cache.get(text);
        if (cached) return cached;
        const idx = uniqueMap.get(text);
        return uniqueResults[idx!];
      });
    } finally {
      this.inferenceInProgress = false;
    }
  }
}

/** Singleton instance */
export const embeddingService = new EmbeddingService();
