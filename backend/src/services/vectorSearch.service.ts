import { qdrantClient, SKILL_COLLECTION_NAME, VECTOR_DIMENSION } from '../config/qdrant.js';
import { embeddingService } from './embedding.service.js';
import { runSkillStage } from '../utils/skillPipeline.js';

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
  return (await findSimilarSkillsBatch([rawSkill], topK))[0];
}

/** One bounded embedding pass and one Qdrant request, rather than one request per skill. */
export async function findSimilarSkillsBatch(rawSkills: string[], topK = 3): Promise<SkillMatch[][]> {
  if (!rawSkills.length) return [];
  const vectors = await runSkillStage('embedding', 60_000, async signal => {
    const result = await embeddingService.generateEmbeddings(rawSkills, 16, signal);
    if (result.length !== rawSkills.length || result.some(v => v.length !== VECTOR_DIMENSION || v.some(n => !Number.isFinite(n)))) {
      throw new Error('Invalid embedding batch');
    }
    return result;
  });
  return runSkillStage('qdrant', 10_000, async () => {
    const results = await qdrantClient.queryBatch(SKILL_COLLECTION_NAME, {
      searches: vectors.map(vector => ({ query: vector, limit: topK, with_payload: true })),
      timeout: 8,
    });
    if (results.length !== rawSkills.length || results.some(result => !result.points.length)) {
      throw new Error('Skill taxonomy is empty or search results are incomplete');
    }
    return results.map(({ points }) => points.map(result => {
      const skill = result.payload?.skill_name;
      if (typeof skill !== 'string' || !skill.trim() || !Number.isFinite(result.score)) {
        throw new Error('Invalid taxonomy payload');
      }
      return { skill, score: result.score };
    }));
  });
}
