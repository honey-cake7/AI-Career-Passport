import { createHash, randomBytes } from 'node:crypto';
import { compareRequirements, type Requirement, type ReviewedRequirement } from './jobReview.js';
import { inputObject, inputText, inputUrl, ResumeInputError, type ResumeContent } from '../validation/resume.js';

export type Confirmation = 'has_experience' | 'needs_practice' | 'needs_review';
export type PlanStatus = 'planned' | 'in_progress' | 'completed';
export interface GapPlan {
  id: string; requirementKey: string; requirement: Requirement; confirmation: Confirmation;
  task: string; criteria: string[]; checks: boolean[]; status: PlanStatus;
  notes: string; link: string; createdAt: string; updatedAt: string;
  assessment: { revision: number; checkedAt: string; status: ReviewedRequirement['status']; evidence: ReviewedRequirement['evidence'] };
}

export function requirementKey(requirement: Requirement) {
  return createHash('sha256').update(JSON.stringify([requirement.kind, requirement.term.toLowerCase(), requirement.quote.replace(/\s+/g, ' ').trim()])).digest('hex');
}

const exercises: { terms: string[]; task: string; criteria: string[] }[] = [
  { terms: ['docker'], task: 'Package one existing project feature with Docker', criteria: ['The app builds and starts using documented commands.', 'Configuration and secrets are supplied outside the image.', 'A smoke check demonstrates that the running feature works.'] },
  { terms: ['react', 'react.js', 'reactjs'], task: 'Build one usable React feature in an existing project', criteria: ['A user can complete one clear interaction with real local or test data.', 'Loading, empty and error states are handled where relevant.', 'Keyboard use and a focused interaction test have been checked.'] },
  { terms: ['typescript', 'ts'], task: 'Type one existing module and check its input boundaries', criteria: ['The module passes the project typecheck without broad any escapes.', 'Untrusted input is validated at runtime.', 'Tests cover a normal input and a rejected input.'] },
  { terms: ['mongodb', 'postgresql', 'postgres', 'sql'], task: 'Persist one project feature and test its data boundaries', criteria: ['Data can be saved and loaded using a documented model or schema.', 'Invalid input is rejected without overwriting saved data.', 'A focused test covers an important access or consistency rule.'] },
];

export function suggestedTask(requirement: Requirement, confirmation: Confirmation) {
  if (confirmation === 'needs_review') return { task: `Check the actual conditions for “${requirement.label}”`, criteria: ['Read the full quoted requirement and its surrounding context.', 'Record what is known, unknown, and what still needs confirmation.', 'Record a factual next action without claiming eligibility or proficiency.'] };
  if (confirmation === 'has_experience') return { task: `Document one real example using ${requirement.term}`, criteria: ['Describe the project or role and your own contribution.', 'Record the approach and actual outcome, without inventing numbers.', 'Prepare truthful wording and note any limits on what you can claim.'] };
  const exercise = exercises.find(x => x.terms.includes(requirement.term.toLowerCase()));
  return exercise ? { task: `${exercise.task} (${requirement.term})`, criteria: exercise.criteria } : {
    task: `Use ${requirement.term} for one scoped change in an existing project`,
    criteria: ['Write the expected behavior and a small deliverable before starting.', 'Demonstrate the working change and test one failure or edge case.', 'Document your contribution, how to verify it, and its limitations.'],
  };
}

export function assessPlan(requirement: Requirement, content: ResumeContent, revision: number): GapPlan['assessment'] {
  const result = compareRequirements([requirement], content)[0]!;
  return { revision, checkedAt: new Date().toISOString(), status: result.status, evidence: result.evidence };
}

export function createGapPlan(requirement: Requirement, confirmation: unknown, content: ResumeContent, revision: number): GapPlan {
  if (typeof confirmation !== 'string' || !['has_experience', 'needs_practice', 'needs_review'].includes(confirmation)) throw new ResumeInputError('Choose whether you have experience, need practice, or need to check.');
  if (requirement.kind !== 'skill' && confirmation !== 'needs_review') throw new ResumeInputError('This requirement needs manual verification, not a skill practice plan.');
  const choice = confirmation as Confirmation;
  const { task, criteria } = suggestedTask(requirement, choice);
  const now = new Date().toISOString();
  return { id: randomBytes(12).toString('hex'), requirementKey: requirementKey(requirement),
    requirement: { id: requirement.id, label: requirement.label, quote: requirement.quote, kind: requirement.kind, term: requirement.term, priority: requirement.priority },
    confirmation: choice, task, criteria: [...criteria], checks: criteria.map(() => false), status: 'planned', notes: '', link: '',
    createdAt: now, updatedAt: now, assessment: assessPlan(requirement, content, revision) };
}

export function editGapPlan(plan: GapPlan, value: unknown): GapPlan {
  const body = inputObject(value, ['task', 'criteria', 'checks', 'status', 'notes', 'link'], 'Plan update');
  const task = inputText(body.task, 'Task', true, 500);
  if (!Array.isArray(body.criteria) || !body.criteria.length || body.criteria.length > 5) throw new ResumeInputError('Use 1–5 completion criteria.');
  const criteria = body.criteria.map(x => inputText(x, 'Completion criterion', true, 300));
  if (!Array.isArray(body.checks) || body.checks.length !== criteria.length || body.checks.some(x => typeof x !== 'boolean')) throw new ResumeInputError('Each criterion needs a checked or unchecked value.');
  if (typeof body.status !== 'string' || !['planned', 'in_progress', 'completed'].includes(body.status)) throw new ResumeInputError('Choose a valid plan status.');
  const notes = inputText(body.notes, 'Outcome notes', false, 3000);
  const link = inputUrl(body.link, 'Evidence URL');
  if (body.status === 'completed' && (!notes || body.checks.some(x => !x))) throw new ResumeInputError('To record completion, check every criterion and describe what you actually did.');
  return { ...plan, task, criteria, checks: body.checks as boolean[], status: body.status as PlanStatus, notes, link, updatedAt: new Date().toISOString() };
}
