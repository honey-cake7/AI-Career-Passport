import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRequirements, type Requirement } from '../src/services/jobReview.js';
import { coverageFor, definition, editRequirements, reassessReview } from '../src/services/jobCoverage.js';
import type { ResumeContent } from '../src/validation/resume.js';

const content: ResumeContent = { personalInfo: { fullName: 'Synthetic Candidate' }, experiences: [], education: [],
  projects: [{ title: 'Demo', description: 'Built features using React, TypeScript and Node.js.', techStack: [] }], skills: ['Docker'] };
function requirement(term: string, priority: Requirement['priority'] = 'required'): Requirement {
  return { id: `r:${term}`, label: term, quote: `${term} is required.`, kind: 'skill', term, priority };
}

test('coverage explains 3 of 5 work mentions, keeps claims separate and excludes unknowns from the percentage', () => {
  const requirements: Requirement[] = ['React', 'TypeScript', 'Node.js', 'Docker', 'PostgreSQL'].map(term => requirement(term));
  requirements.push({ ...requirement('Degree'), kind: 'context', term: '' }, { ...requirement('3 years'), kind: 'context', term: '' },
    { ...requirement('Kubernetes'), excluded: true }, requirement('ReactJS', 'preferred'), requirement('Go', 'preferred'));
  const result = coverageFor(compareRequirements(requirements, content));
  assert.deepEqual(result.groups.required, { assessed: 5, workMentions: 3, listedOnly: 1, notFound: 1, unassessed: 2, excluded: 1, duplicates: 0, workPercent: 60 });
  assert.equal(result.groups.preferred.assessed, 1); assert.equal(result.groups.preferred.workPercent, 0);
  assert.deepEqual(result.duplicates, [{ id: 'r:ReactJS', countedAs: 'r:React' }]);
  assert.equal(result.groups.unspecified.workPercent, null);
});

test('aliases count under the strongest included priority independently of model row order', () => {
  const result = coverageFor(compareRequirements([requirement('ReactJS', 'preferred'), requirement('React', 'unspecified'), requirement('React.js')], content));
  assert.equal(result.groups.required.assessed, 1); assert.equal(result.groups.preferred.duplicates, 1);
  assert.equal(result.groups.unspecified.duplicates, 1); assert.equal(result.groups.required.workPercent, 100);
  const excluded = coverageFor(compareRequirements([{ ...requirement('React'), excluded: true }, requirement('ReactJS', 'preferred')], content));
  assert.equal(excluded.groups.required.workPercent, null); assert.equal(excluded.groups.preferred.workPercent, 100);
});

test('zero/uncertain denominators are unavailable; language names stay distinct and rounding is explicit', () => {
  assert.equal(coverageFor([]).groups.required.workPercent, null);
  const uncertain = compareRequirements([requirement('React')], { ...content, projects: [{ title: 'Learning', techStack: [], description: 'I have never used React.' }] });
  assert.equal(coverageFor(uncertain).groups.required.unassessed, 1);
  assert.equal(coverageFor(uncertain).groups.required.workPercent, null);
  const languages = compareRequirements(['C', 'C++', 'Java'].map(term => requirement(term)), { ...content, projects: [{ title: 'Demo', techStack: [], description: 'Used C++ and JavaScript.' }] });
  assert.equal(coverageFor(languages).groups.required.assessed, 3);
  assert.equal(coverageFor(languages).groups.required.workPercent, 33);
});

test('editing requirements retains the original extraction and server-owned identities', () => {
  const original = requirement('React'); const jd = original.quote + ' Docker is preferred.';
  const first = editRequirements([{ ...definition(original), priority: 'preferred', excluded: false },
    { label: 'Docker', quote: 'Docker is preferred.', kind: 'skill', term: 'Docker', priority: 'preferred' }], [original], jd);
  assert.deepEqual(first[0].original, original); assert.equal(first[0].origin, 'model');
  assert.equal(first[1].origin, 'user'); assert.match(first[1].id, /^requirement:[a-f0-9]{24}$/);
  const second = editRequirements(first.map(r => ({ ...definition(r), excluded: true, label: 'My corrected label' })), first, jd);
  assert.deepEqual(second[0].original, original); assert.equal(second[1].original, undefined);
  assert.equal(coverageFor(compareRequirements(second, content)).groups.preferred.workPercent, null);
});

test('requirement edits reject forged evidence, invented quotes, partial names, duplicates and implicit deletion', () => {
  const original = requirement('React');
  const row = definition(original);
  for (const value of [null, [], [{ ...row, id: 'forged' }], [row, row], [{ ...row, status: 'work_mention' }],
    [{ ...row, original: row }], [{ ...row, origin: 'user' }], [{ ...row, evidence: [] }],
    [{ ...row, quote: 'Invented' }], [{ ...row, excluded: 'false' }], [{ ...row, priority: 'essential' }],
    [{ ...row, label: 'x'.repeat(201) }], Array(31).fill(row)]) {
    assert.throws(() => editRequirements(value, [original], original.quote));
  }
  assert.throws(() => editRequirements([{ ...row, term: 'Java', quote: 'JavaScript required.' }], [original], 'JavaScript required.'));
  assert.throws(() => editRequirements([{ ...row, quote: 'React or Vue required.' }], [original], 'React or Vue required.'));
  assert.equal(editRequirements([{ ...row, quote: 'React or Vue required.', kind: 'context', term: '' }], [original], 'React or Vue required.')[0].kind, 'context');
});

test('local reassessment preserves edits, updates evidence and never fabricates achievements', () => {
  const initial = reassessReview(undefined, [requirement('Docker')], content, 0);
  assert.equal(initial.coverage?.groups.required.workPercent, 0); assert.equal(initial.usage.model, 'manual');
  const changed = { ...content, projects: [{ title: 'Demo', description: 'Built a parser.\nPackaged the demo with Docker.', techStack: [] }] };
  const current = reassessReview(initial, [{ ...requirement('Docker'), origin: 'user' }], changed, 1);
  assert.equal(current.revision, 1); assert.equal(current.coverage?.groups.required.workPercent, 100);
  assert.equal(current.requirements[0].evidence[0].text, 'Packaged the demo with Docker.');
  assert.equal(current.requirements[0].origin, 'user'); assert.deepEqual(current.usage, initial.usage);
  assert.deepEqual(current.suggestions[0].proposed.split('\n').sort(), current.suggestions[0].original.split('\n').sort());
});
