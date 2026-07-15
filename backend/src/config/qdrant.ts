import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';

dotenv.config();

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

/**
 * Singleton Qdrant client instance.
 */
export const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
});

/** The name of the Qdrant collection for the skill taxonomy. */
export const SKILL_COLLECTION_NAME = process.env.QDRANT_COLLECTION || 'skill_taxonomy';

/** Embedding vector dimension (BGESmallEN produces 384-dim vectors). */
export const VECTOR_DIMENSION = 384;
