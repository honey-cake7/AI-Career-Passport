import { EmbeddingModel, FlagEmbedding } from 'fastembed';

/**
 * Singleton embedding service backed by fastembed (ONNX runtime, local inference).
 * Uses the BGESmallEN model which produces 384-dimensional vectors.
 */
class EmbeddingService {
  private model: FlagEmbedding | null = null;
  private initPromise: Promise<FlagEmbedding> | null = null;

  /**
   * Lazily initializes the embedding model. Thread-safe via promise caching.
   */
  private async getModel(): Promise<FlagEmbedding> {
    if (this.model) return this.model;

    // Prevent multiple concurrent initializations
    if (!this.initPromise) {
      this.initPromise = FlagEmbedding.init({
        model: EmbeddingModel.BGESmallENV15,
      }).then((m) => {
        this.model = m;
        console.log('🧠 Embedding model (BGESmallEN v1.5) initialized');
        return m;
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
    const model = await this.getModel();
    const embeddings = model.embed([text], 1);

    for await (const batch of embeddings) {
      // batch is number[][] — we only have one input so take the first
      return Array.from(batch[0]);
    }

    throw new Error('Failed to generate embedding: no output produced');
  }

  /**
   * Generate embedding vectors for multiple texts in batches.
   *
   * @param texts - Array of texts to embed
   * @param batchSize - Number of texts per batch (default: 32)
   * @returns Array of 384-dimensional number arrays
   */
  async generateEmbeddings(texts: string[], batchSize = 32): Promise<number[][]> {
    const model = await this.getModel();
    const results: number[][] = [];
    const embeddings = model.embed(texts, batchSize);

    for await (const batch of embeddings) {
      for (const vec of batch) {
        results.push(Array.from(vec));
      }
    }

    return results;
  }
}

/** Singleton instance */
export const embeddingService = new EmbeddingService();
