import type { ResumeContent } from '../validation/resume.js';
import { inputObject, inputText } from '../validation/resume.js';

export type EvidenceStatus = 'work_mention' | 'claim_only' | 'not_found' | 'unassessed';
export interface ResumeSource { id: string; label: string; text: string }
export interface Requirement {
  id: string; label: string; quote: string; kind: 'skill' | 'context'; term: string;
  priority: 'required' | 'preferred' | 'unspecified';
}
export interface ReviewedRequirement extends Requirement {
  status: EvidenceStatus; evidence: ResumeSource[]; action: string;
}
export interface EditSuggestion { id: string; sourceId: string; sourceLabel: string; original: string; proposed: string; reason: string }
export interface JobReview {
  schemaVersion: 1; revision: number; generatedAt: string;
  requirements: ReviewedRequirement[]; suggestions: EditSuggestion[];
  usage: { model: string; inputTokens: number | null; outputTokens: number | null };
}

export function resumeSources(content: ResumeContent): ResumeSource[] {
  return [
    { id: 'summary', label: 'Summary', text: content.personalInfo.summary ?? '' },
    ...content.experiences.map((x, i) => ({ id: `experience:${i}`, label: `Experience ${i + 1}: ${x.title} at ${x.company}`, text: x.description ?? '' })),
    ...content.projects.map((x, i) => ({ id: `project:${i}`, label: `Project ${i + 1}: ${x.title}`, text: x.description ?? '' })),
  ].filter(x => x.text.trim());
}

const aliases = [ ['react', 'react.js', 'reactjs'], ['node.js', 'nodejs'], ['typescript', 'ts'],
  ['javascript', 'js'], ['postgresql', 'postgres'], ['scikit-learn', 'sklearn'], ['pytorch', 'torch'] ];
function mentions(text: string, term: string): boolean {
  const names = aliases.find(group => group.includes(term.toLowerCase())) ?? [term.toLowerCase()];
  return names.some(name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // C must not match C++, and Java must not match JavaScript.
    return new RegExp(`(^|[^\\p{L}\\p{N}+#])${escaped}($|[^\\p{L}\\p{N}+#])`, 'iu').test(text);
  });
}

function actionFor(requirement: Requirement, status: EvidenceStatus) {
  if (status === 'unassessed') return 'Check this requirement and its context yourself. This comparison cannot establish eligibility, duration, depth of experience, alternatives, or negated/aspirational statements.';
  if (status === 'work_mention') return `Prepare an example of your contribution using ${requirement.term}. A mention in a resume is not independent proof of proficiency.`;
  if (status === 'claim_only') return `Add a truthful project or experience example using ${requirement.term}: your contribution, approach and outcome. If none exists, plan practice first.`;
  return `If you have used ${requirement.term}, describe one concrete example. If you have not, use it in a small extension to an existing project, test the result, and document what you did before adding it to your resume.`;
}

/** Exact/declared aliases only. No semantic score is treated as proof of ability. */
export function compareRequirements(requirements: Requirement[], content: ResumeContent): ReviewedRequirement[] {
  const sources = resumeSources(content).filter(x => x.id !== 'summary');
  const claims = [...content.skills, content.personalInfo.summary ?? '', ...content.projects.flatMap(x => x.techStack)].join('\n');
  return requirements.map(requirement => {
    const matches = requirement.kind === 'skill' ? sources.filter(x => mentions(x.text, requirement.term)).map(x => {
      const lines = x.text.split('\n').filter(line => mentions(line, requirement.term));
      return { ...x, text: lines.join('\n').slice(0, 1200) };
    }).slice(0, 5) : [];
    // A conservative uncertainty rule avoids turning “never used React” or
    // aspirational learning plans into positive work evidence. False negatives
    // remain visible for human review instead of implying objective proficiency.
    const uncertain = /\b(no|not|never|without|learning|studying|plan(?:ning)? to|want to|interested in)\b/i;
    const positive = matches.map(x => ({ ...x, text: x.text.split('\n').filter(line => !uncertain.test(line)).join('\n') })).filter(x => x.text);
    const evidence = positive.length ? positive : matches;
    const status: EvidenceStatus = requirement.kind !== 'skill' ? 'unassessed' : positive.length ? 'work_mention' : matches.length ? 'unassessed' : mentions(claims, requirement.term) ? 'claim_only' : 'not_found';
    return { ...requirement, status, evidence, action: actionFor(requirement, status) };
  });
}

/** No invented names, numbers or achievements: AI may select/reorder complete
 * existing lines only. Users may edit wording manually before accepting/saving. */
export function parseJobReviewOutput(value: unknown, jobDescription: string, content: ResumeContent) {
  const root = inputObject(value, ['requirements', 'suggestions'], 'Job review');
  if (!Array.isArray(root.requirements) || !root.requirements.length || root.requirements.length > 20) throw new Error('Invalid requirements list');
  if (!Array.isArray(root.suggestions) || root.suggestions.length > 5) throw new Error('Invalid suggestions list');
  const requirements: Requirement[] = root.requirements.map((value, i) => {
    const r = inputObject(value, ['label', 'quote', 'kind', 'term', 'priority'], 'Requirement');
    const label = inputText(r.label, 'Requirement label', true, 200);
    const quote = inputText(r.quote, 'Requirement quote', true, 1200);
    if (!jobDescription.includes(quote)) throw new Error('Unverifiable job quote');
    if (r.kind !== 'skill' && r.kind !== 'context') throw new Error('Invalid requirement kind');
    if (!['required', 'preferred', 'unspecified'].includes(String(r.priority))) throw new Error('Invalid priority');
    const term = inputText(r.term, 'Skill term', r.kind === 'skill', 100);
    if (r.kind === 'skill' && !quote.toLowerCase().includes(term.toLowerCase())) throw new Error('Skill not present in cited requirement');
    const qualified = /\b(or|either|unless|not|without|no)\b|\b\d+\s*\+?\s*(years?|months?)\b/i.test(quote);
    const kind = qualified ? 'context' : r.kind;
    return { id: `requirement:${i}`, label, quote, kind, term: kind === 'skill' ? term : '', priority: r.priority as Requirement['priority'] };
  });
  const sources = resumeSources(content);
  const used = new Set<string>();
  const suggestions: EditSuggestion[] = root.suggestions.map((value, i) => {
    const s = inputObject(value, ['sourceId', 'proposed', 'requirementIndex'], 'Suggestion');
    const source = sources.find(x => x.id === s.sourceId);
    if (!source || used.has(source.id)) throw new Error('Invalid suggestion source');
    used.add(source.id);
    if (!Number.isInteger(s.requirementIndex) || !requirements[s.requirementIndex as number]) throw new Error('Invalid related requirement');
    const proposed = inputText(s.proposed, 'Proposed text', true, 10000);
    const available = source.text.split('\n').map(x => x.trim()).filter(Boolean);
    const lines = proposed.split('\n').map(x => x.trim()).filter(Boolean);
    for (const line of lines) {
      const index = available.indexOf(line);
      if (index < 0) throw new Error('Suggestion introduced or altered a factual line');
      available.splice(index, 1);
    }
    if (proposed === source.text.trim()) throw new Error('Unchanged suggestion');
    return { id: `suggestion:${i}`, sourceId: source.id, sourceLabel: source.label, original: source.text, proposed,
      reason: `Focus this section on “${requirements[s.requirementIndex as number]!.label}” by selecting or reordering existing lines. Review the omitted context before accepting.` };
  });
  return { requirements: compareRequirements(requirements, content), suggestions };
}
