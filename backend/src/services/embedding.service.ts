import { EmbeddingModel, FlagEmbedding } from 'fastembed';

/**
 * Singleton embedding service backed by fastembed (ONNX runtime, local inference).
 * Uses the BGESmallEN model which produces 384-dimensional vectors.
 */
export class EmbeddingService {
  private model: FlagEmbedding | null = null;
  private initPromise: Promise<FlagEmbedding> | null = null;

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
   * @param batchSize - Number of texts per batch (default: 32)
   * @returns Array of 384-dimensional number arrays
   */
  async generateEmbeddings(texts: string[], batchSize = 8, signal?: AbortSignal): Promise<number[][]> {
    if (!texts.length) return [];
    signal?.throwIfAborted();
    const model = await this.getModel();
    // FastEmbed initialization has no abort API. It stays shared while loading;
    // expired uploads must not start inference when that initialization completes.
    signal?.throwIfAborted();
    const results: number[][] = [];
    const embeddings = model.embed(texts, batchSize);

    for await (const batch of embeddings) {
      signal?.throwIfAborted();
      for (const vec of batch) {
        results.push(Array.from(vec));
      }
    }

    return results;
  }
}

/** Singleton instance */
export const embeddingService = new EmbeddingService();
