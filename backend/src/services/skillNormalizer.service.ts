import { groqClient, GROQ_MODEL } from '../config/groq.js';
import { findSimilarSkills, type SkillMatch } from './vectorSearch.service.js';

/**
 * Step A: Extract raw, un-normalized skills from resume text using the LLM.
 *
 * @param resumeText - The raw text extracted from the PDF resume
 * @returns Array of raw skill strings as found in the resume
 */
export async function extractRawSkills(resumeText: string): Promise<string[]> {
  const systemPrompt = `You are an expert at identifying technical and professional skills from resume text.
Extract ALL skills, technologies, tools, frameworks, programming languages, platforms, methodologies, and relevant competencies mentioned in the resume.

Rules:
- Include both hard skills (e.g., "Python", "React", "AWS") and soft skills (e.g., "Leadership", "Agile").
- Extract skills exactly as they appear or with minor normalization (e.g., "react.js" and "ReactJS" are fine).
- Do NOT invent skills not present in the text.
- Respond with ONLY a JSON object with a skills property containing an array of strings. No markdown or explanation.

Example output: {"skills":["Python","React.js","AWS","Docker","Agile","SQL"]}`;

  const response = await groqClient.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Extract all skills from this resume:\n\n${resumeText}` },
    ],
    temperature: 0.1,
    max_completion_tokens: 4096,
    response_format: { type: 'json_object' },
    ...(GROQ_MODEL.startsWith('openai/gpt-oss-')
      ? { reasoning_effort: 'low' as const, include_reasoning: false }
      : {}),
  });

  const choice = response.choices[0];
  if (choice?.finish_reason === 'length') {
    throw new Error('Skill extraction response reached the output token limit');
  }
  const content = choice?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response during skill extraction');
  }

  try {
    const jsonStr = content
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed: unknown = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object' || !('skills' in parsed) || !Array.isArray(parsed.skills)) {
      throw new Error('Expected a JSON object with a skills array');
    }

    return [...new Set(parsed.skills
      .filter((skill): skill is string => typeof skill === 'string' && skill.trim().length > 0)
      .map(skill => skill.trim()))];
  } catch (parseError) {
    console.error('skill_extraction_invalid_response');
    throw new Error(
      `Failed to parse skill extraction result: ${parseError instanceof Error ? parseError.message : String(parseError)}`
    );
  }
}

/**
 * Step C: Given a raw skill and its top vector DB matches, use the LLM to pick
 * the single best canonical skill name — or discard if no match is appropriate.
 *
 * @param rawSkill - The original raw skill string
 * @param vectorMatches - Top-K matches from the skill taxonomy vector DB
 * @returns The canonical skill name, or null if no good match exists
 */
async function normalizeSkill(rawSkill: string, vectorMatches: SkillMatch[]): Promise<string | null> {
  // If the top match has a very high score, fast-path without LLM call
  if (vectorMatches.length > 0 && vectorMatches[0].score > 0.95) {
    return vectorMatches[0].skill;
  }

  const matchesContext = vectorMatches
    .map((m, i) => `  ${i + 1}. "${m.skill}" (similarity: ${m.score.toFixed(3)})`)
    .join('\n');

  const systemPrompt = `You are a skill normalization engine. Given a raw skill extracted from a resume and a list of canonical skill names from a taxonomy, your job is to output the SINGLE best matching canonical skill.

Rules:
- If the raw skill clearly maps to one of the provided canonical skills, output that exact canonical name.
- If none of the provided canonical skills are a good match for the raw skill, output "NONE".
- Output ONLY the canonical skill name (or "NONE"). No explanation, no quotes, no punctuation.

Examples:
- Raw: "reactjs", Matches: ["React.js", "React Native", "Angular"] → React.js
- Raw: "k8s", Matches: ["Kubernetes", "Docker", "Helm"] → Kubernetes
- Raw: "cooking", Matches: ["Python", "Java", "C++"] → NONE`;

  const response = await groqClient.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Raw skill: "${rawSkill}"\n\nCanonical skill candidates:\n${matchesContext}\n\nBest match:`,
      },
    ],
    temperature: 0,
    max_tokens: 50,
  });

  const result = response.choices[0]?.message?.content?.trim();
  if (!result || result.toUpperCase() === 'NONE') {
    return null;
  }

  return result;
}

/**
 * Full RAG orchestration: extract raw skills → vector search → LLM normalization.
 *
 * @param resumeText - The raw text extracted from the PDF resume
 * @returns Deduplicated array of normalized, canonical skill names
 */
export async function normalizeSkillsFromResume(resumeText: string): Promise<string[]> {
  console.log('🔍 Step A: Extracting raw skills from resume...');
  const rawSkills = await extractRawSkills(resumeText);
  console.log(`skill_extraction_complete count=${rawSkills.length}`);

  console.log('🎯 Steps B+C: Normalizing each skill via vector search + LLM...');
  const normalizedSkills: Set<string> = new Set();

  // Process skills concurrently in batches to balance speed and API rate limits
  const BATCH_SIZE = 5;
  for (let i = 0; i < rawSkills.length; i += BATCH_SIZE) {
    const batch = rawSkills.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (rawSkill) => {
        try {
          // Step B: Vector search for top 3 matches
          const vectorMatches = await findSimilarSkills(rawSkill, 3);

          // Step C: LLM normalization
          const canonical = await normalizeSkill(rawSkill, vectorMatches);
          return canonical;
        } catch (error) {
          console.warn('skill_normalization_failed');
          return null;
        }
      })
    );

    for (const skill of results) {
      if (skill) {
        normalizedSkills.add(skill);
      }
    }
  }

  const finalSkills = Array.from(normalizedSkills).sort();
  console.log(`✅ Normalization complete: ${rawSkills.length} raw → ${finalSkills.length} canonical skills`);
  return finalSkills;
}
