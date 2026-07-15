import { qdrantClient, SKILL_COLLECTION_NAME } from '../config/qdrant.js';
import { embeddingService } from './embedding.service.js';

export interface SkillMatch {
  skill: string;
  score: number;
}

/**
 * Search the skill taxonomy vector collection for skills similar to the given raw skill text.
 *
 * @param rawSkill - The un-normalized raw skill string (e.g., "reactjs", "node")
 * @param topK - Number of nearest matches to return (default: 3)
 * @returns Array of matched canonical skills with similarity scores
 */
export async function findSimilarSkills(rawSkill: string, topK = 3): Promise<SkillMatch[]> {
  // Generate embedding for the raw skill
  const queryVector = await embeddingService.generateEmbedding(rawSkill);

  // Search Qdrant for nearest neighbors
  const searchResult = await qdrantClient.search(SKILL_COLLECTION_NAME, {
    vector: queryVector,
    limit: topK,
    with_payload: true,
  });

  return searchResult.map((result) => ({
    skill: (result.payload?.skill_name as string) || 'Unknown',
    score: result.score,
  }));
}
