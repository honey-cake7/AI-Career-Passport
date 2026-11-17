import { inputObject, inputText, ResumeInputError } from '../validation/resume.js';

export interface SkillEntry {
  id: string;
  raw: string;
  suggestion: string | null;
  method: 'exact' | 'model' | 'unresolved';
  choice: 'pending' | 'original' | 'suggested' | 'custom';
  value: string;
}
export interface SkillNormalization {
  schemaVersion: 1;
  generatedAt: string;
  status: 'ready' | 'unavailable';
  entries: SkillEntry[];
}

export function skillText(value: unknown): string {
  const text = inputText(value, 'Skill', true, 100);
  if (/[\r\n\t]/.test(text)) throw new ResumeInputError('Each skill must be on one line');
  return text;
}

export function skillSnapshot(raw: string[], status: SkillNormalization['status'] = 'ready'): SkillNormalization {
  if (raw.length > 150) throw new ResumeInputError('At most 150 skills can be reviewed');
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), status,
    entries: raw.map((value, i) => {
      const text = skillText(value);
      return { id: `skill:${i}`, raw: text, suggestion: null, method: 'unresolved', choice: 'pending', value: text };
    }) };
}

/** Only decisions are writable by clients. Candidate names and provenance stay server-owned. */
export function applySkillReviews(snapshot: SkillNormalization | undefined, input: unknown, skills: string[]): SkillNormalization | undefined {
  if (input === undefined) return snapshot;
  if (!Array.isArray(input) || input.length > 150) throw new ResumeInputError('Skill reviews must be a list of at most 150 decisions');
  if (!input.length) return snapshot;
  if (!snapshot) throw new ResumeInputError('Review saved skill names before saving decisions');
  const next = structuredClone(snapshot);
  const seen = new Set<string>();
  for (const item of input) {
    const decision = inputObject(item, ['id', 'choice', 'value'], 'Skill review');
    const entry = next.entries.find(entry => entry.id === decision.id);
    if (!entry || seen.has(entry.id)) throw new ResumeInputError('Skill review refers to an unknown or repeated entry');
    seen.add(entry.id);
    if (!['original', 'suggested', 'custom'].includes(String(decision.choice))) throw new ResumeInputError('Choose original, suggested or custom skill wording');
    if (decision.choice !== 'custom' && decision.value !== undefined) throw new ResumeInputError('Only custom skill wording accepts a value');
    const value = decision.choice === 'original' ? entry.raw : decision.choice === 'suggested' ? entry.suggestion : skillText(decision.value);
    if (!value || !skills.includes(value)) throw new ResumeInputError('Chosen skill wording must appear in your saved skills');
    entry.choice = decision.choice as SkillEntry['choice'];
    entry.value = value;
  }
  return next;
}

export async function normalizationProvider(skills: string[]): Promise<SkillNormalization> {
  const fallback = skillSnapshot(skills, 'unavailable');
  if (!process.env.GROQ_API_KEY?.trim()) return fallback;
  // A failed optional provider/native-module import must not block manual review.
  try { return await (await import('./skillNormalizer.service.js')).normalizeRawSkills(skills); }
  catch { console.warn('skill_suggestions_unavailable stage=initialization'); return fallback; }
}

// One normalization request per account across base and job versions. The existing
// native embedding admission and stage deadlines bound the underlying work too.
const active = new Set<string>();
export async function withSkillReview<T>(userId: string, work: () => Promise<T>): Promise<T | null> {
  if (active.has(userId)) return null;
  active.add(userId);
  try { return await work(); }
  finally { active.delete(userId); }
}
