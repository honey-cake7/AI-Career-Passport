import { randomBytes } from 'node:crypto';
import { compareRequirements, parseRequirement, resumeSources, skillIdentity, type JobReview, type Requirement, type RequirementDefinition } from './jobReview.js';
import { inputObject, ResumeInputError, type ResumeContent } from '../validation/resume.js';

export interface CoverageGroup {
  assessed: number; workMentions: number; listedOnly: number; notFound: number;
  unassessed: number; excluded: number; duplicates: number; workPercent: number | null;
}
export interface JobCoverage {
  schemaVersion: 1;
  groups: Record<Requirement['priority'], CoverageGroup>;
  duplicates: { id: string; countedAs: string }[];
}
const priorities = ['required', 'preferred', 'unspecified'] as const;

/** Equal weight for distinct assessable skill names. No eligibility/proficiency prediction. */
export function coverageFor(requirements: JobReview['requirements']): JobCoverage {
  const groups = Object.fromEntries(priorities.map(priority => [priority, {
    assessed: 0, workMentions: 0, listedOnly: 0, notFound: 0, unassessed: 0, excluded: 0, duplicates: 0, workPercent: null,
  }])) as JobCoverage['groups'];
  const seen = new Map<string, string>();
  const duplicates: JobCoverage['duplicates'] = [];
  // Count an alias once, under its strongest active priority; keep every row visible.
  for (const priority of priorities) for (const r of requirements.filter(r => r.priority === priority)) {
    const group = groups[priority];
    if (r.excluded) { group.excluded++; continue; }
    if (r.kind === 'skill') {
      const key = skillIdentity(r.term);
      const earlier = seen.get(key);
      if (earlier) { group.duplicates++; duplicates.push({ id: r.id, countedAs: earlier }); continue; }
      seen.set(key, r.id);
    }
    if (r.kind !== 'skill' || r.status === 'unassessed') { group.unassessed++; continue; }
    group.assessed++;
    if (r.status === 'work_mention') group.workMentions++;
    else if (r.status === 'claim_only') group.listedOnly++;
    else group.notFound++;
  }
  for (const group of Object.values(groups)) group.workPercent = group.assessed ? Math.round(100 * group.workMentions / group.assessed) : null;
  return { schemaVersion: 1, groups, duplicates };
}

export function withCoverage(review: JobReview): JobReview {
  return { ...review, coverage: coverageFor(review.requirements) };
}
export const definition = ({ id, label, quote, kind, term, priority }: Requirement): RequirementDefinition => ({ id, label, quote, kind, term, priority });

export function editRequirements(value: unknown, previous: Requirement[], jobDescription: string): Requirement[] {
  if (!Array.isArray(value) || value.length > 30) throw new ResumeInputError('Use at most 30 requirements');
  const seen = new Set<string>();
  const result = value.map(item => {
    const body = inputObject(item, ['id', 'label', 'quote', 'kind', 'term', 'priority', 'excluded'], 'Requirement edit');
    const existing = body.id === undefined ? undefined : previous.find(r => r.id === body.id);
    if (body.id !== undefined && (!existing || seen.has(existing.id))) throw new ResumeInputError('Unknown or repeated requirement ID');
    if (existing) seen.add(existing.id);
    if (body.excluded !== undefined && typeof body.excluded !== 'boolean') throw new ResumeInputError('Requirement exclusion must be true or false');
    let parsed: RequirementDefinition;
    try {
      const { id: _id, excluded: _excluded, ...fields } = body;
      parsed = parseRequirement(fields, jobDescription, existing?.id ?? `requirement:${randomBytes(12).toString('hex')}`);
      if (body.kind === 'skill' && parsed.kind !== 'skill') throw new Error('This quote contains qualifications or alternatives. Choose context / manual check.');
    } catch (error) { throw new ResumeInputError(error instanceof Error ? error.message : 'Invalid requirement'); }
    const excluded = body.excluded === true;
    const changed = existing && (JSON.stringify(definition(existing)) !== JSON.stringify(parsed) || !!existing.excluded !== excluded);
    return { ...parsed, excluded, origin: existing?.origin ?? (existing ? 'model' : 'user'),
      ...(existing?.original ? { original: existing.original } : changed && existing?.origin !== 'user' ? { original: definition(existing!) } : {}) };
  });
  if (previous.some(r => !seen.has(r.id))) throw new ResumeInputError('Keep existing requirements in the list; exclude them explicitly instead of deleting them');
  return result;
}

/** Reuse requirements after factual edits, with no provider call or stale evidence. */
export function reassessReview(previous: JobReview | undefined, requirements: Requirement[], content: ResumeContent, revision: number): JobReview {
  const compared = compareRequirements(requirements, content);
  return withCoverage({ schemaVersion: 1, revision, generatedAt: new Date().toISOString(), requirements: compared,
    suggestions: focusSuggestions(content, compared), usage: previous?.usage ?? { model: 'manual', inputTokens: null, outputTokens: null } });
}

export function focusSuggestions(content: ResumeContent, requirements: JobReview['requirements']): JobReview['suggestions'] {
  const suggestions: JobReview['suggestions'] = [];
  for (const source of resumeSources(content)) {
    const lines = source.text.split('\n').map(x => x.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const relevant = requirements.filter(r => !r.excluded && r.kind === 'skill' && r.status === 'work_mention');
    const ranked = lines.map((line, index) => ({ line, index, matches: relevant.filter(r => r.evidence.some(e => e.id === source.id && e.text.split('\n').some(x => x.trim() === line))) }));
    ranked.sort((a, b) => b.matches.length - a.matches.length || a.index - b.index);
    if (!ranked[0]?.matches.length || ranked.every((x, i) => x.index === i)) continue;
    const proposed = ranked.map(x => x.line).join('\n');
    suggestions.push({ id: `suggestion:${suggestions.length}`, sourceId: source.id, sourceLabel: source.label, original: source.text, proposed,
      reason: `Bring the existing line mentioning “${ranked[0].matches[0]!.label}” first. All original lines are retained; check that their order still makes sense.` });
    if (suggestions.length === 5) break;
  }
  return suggestions;
}
