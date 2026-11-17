import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessPlan, createGapPlan, editGapPlan, requirementKey, suggestedTask } from '../src/services/gapPlans.js';
import type { Requirement } from '../src/services/jobReview.js';
import { fitsVersionBudget } from '../src/routes/versionSupport.js';
import { ResumeInputError, type ResumeContent } from '../src/validation/resume.js';

const requirement: Requirement = { id: 'requirement:0', label: 'Docker', quote: 'Docker is required.', kind: 'skill', term: 'Docker', priority: 'required' };
const resume: ResumeContent = { personalInfo: { fullName: 'Synthetic Candidate' }, skills: [], projects: [], experiences: [], education: [] };
const fields = (plan: ReturnType<typeof createGapPlan>) => ({ task: plan.task, criteria: plan.criteria, checks: plan.checks, status: plan.status, notes: plan.notes, link: plan.link });

test('plans preserve a requirement snapshot and provide scoped, editable starting tasks', () => {
  const plan = createGapPlan(requirement, 'needs_practice', resume, 3);
  assert.match(plan.id, /^[a-f0-9]{24}$/); assert.notEqual(plan.requirement, requirement);
  assert.match(plan.task, /Docker/); assert.equal(plan.criteria.length, 3);
  assert.deepEqual(plan.checks, [false, false, false]); assert.equal(plan.status, 'planned');
  assert.equal(plan.assessment.status, 'not_found'); assert.equal(plan.assessment.revision, 3);
  assert.match(suggestedTask(requirement, 'has_experience').task, /real example/);
  assert.match(suggestedTask({ ...requirement, term: 'UnknownTool' }, 'needs_practice').task, /one scoped change/);
  assert.match(suggestedTask({ ...requirement, term: 'TS' }, 'needs_practice').task, /input boundaries/);
});
test('context requirements need manual verification and confirmation is strictly typed', () => {
  const context = { ...requirement, kind: 'context' as const, term: '' };
  for (const choice of ['needs_practice', 'has_experience']) assert.throws(() => createGapPlan(context, choice, resume, 0), ResumeInputError);
  assert.equal(createGapPlan(context, 'needs_review', resume, 0).assessment.status, 'unassessed');
  for (const choice of [null, ['needs_practice'], {}, 'invented']) assert.throws(() => createGapPlan(requirement, choice, resume, 0), ResumeInputError);
});
test('requirement identity survives model ordering and labels but distinguishes context and quotes', () => {
  assert.equal(requirementKey(requirement), requirementKey({ ...requirement, id: 'requirement:9', label: 'Containers', term: 'docker', quote: 'Docker  is required.' }));
  assert.notEqual(requirementKey(requirement), requirementKey({ ...requirement, quote: 'Docker is preferred.' }));
  assert.notEqual(requirementKey(requirement), requirementKey({ ...requirement, kind: 'context' }));
});
test('completion requires all checks and an outcome, preserves provenance, and never changes assessment', () => {
  const plan = createGapPlan(requirement, 'needs_practice', resume, 0);
  const complete = { ...fields(plan), status: 'completed', checks: [true, true, true], notes: 'Built an image and checked startup with a synthetic configuration.', link: 'https://example.invalid/project' };
  assert.throws(() => editGapPlan(plan, { ...complete, checks: [true, false, true] }), ResumeInputError);
  assert.throws(() => editGapPlan(plan, { ...complete, notes: '  ' }), ResumeInputError);
  const saved = editGapPlan(plan, complete);
  assert.equal(saved.status, 'completed'); assert.equal(saved.requirementKey, plan.requirementKey);
  assert.deepEqual(saved.assessment, plan.assessment); assert.deepEqual(saved.requirement, plan.requirement);
  assert.equal(plan.status, 'planned'); assert.equal(saved.assessment.status, 'not_found');
});
test('plan updates reject forged fields, invalid types, excessive content and unsafe URLs', () => {
  const plan = createGapPlan(requirement, 'has_experience', resume, 0);
  const valid = fields(plan);
  for (const update of [
    { ...valid, requirement }, { ...valid, assessment: {} }, { ...valid, id: 'forged' },
    { ...valid, status: ['completed'] }, { ...valid, checks: ['false', false, false] },
    { ...valid, checks: [false] }, { ...valid, criteria: [] }, { ...valid, criteria: Array(6).fill('criterion') },
    { ...valid, task: 'x'.repeat(501) }, { ...valid, notes: 'x'.repeat(3001) },
    { ...valid, criteria: ['x'.repeat(301)], checks: [false] },
    { ...valid, link: 'javascript:alert(1)' }, { ...valid, link: 'file:///private' }, { ...valid, link: 'https://user:password@example.invalid' },
  ]) assert.throws(() => editGapPlan(plan, update), ResumeInputError);
});
test('reassessment checks saved text locally and makes no claim about completed practice', () => {
  assert.equal(assessPlan(requirement, { ...resume, skills: ['Docker'] }, 1).status, 'claim_only');
  const assessment = assessPlan(requirement, { ...resume, projects: [{ title: 'A real example', techStack: [], description: 'Packaged a demo with Docker and checked its startup.' }] }, 2);
  assert.equal(assessment.status, 'work_mention'); assert.equal(assessment.revision, 2); assert.equal(assessment.evidence.length, 1);
  assert.equal(assessPlan({ ...requirement, kind: 'context', term: '' }, resume, 2).status, 'unassessed');
});
test('the per-version storage budget includes private plan notes and multibyte text', () => {
  const plan = createGapPlan(requirement, 'needs_practice', resume, 0);
  assert.equal(fitsVersionBudget(resume, requirement.quote, undefined, [plan]), true);
  assert.equal(fitsVersionBudget(resume, requirement.quote, undefined, [{ ...plan, notes: '測'.repeat(180000) }]), false);
  assert.equal(fitsVersionBudget(resume, requirement.quote, undefined, [plan], { schemaVersion: 1, generatedAt: '測'.repeat(180000), status: 'ready', entries: [] }), false);
});
