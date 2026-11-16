import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResumeContent, parseResumeSave, parseExtractedResume, ResumeInputError } from '../src/validation/resume.js';

const resume = () => ({ personalInfo: { fullName: 'Synthetic Candidate' }, experiences: [], education: [], projects: [], skills: ['TypeScript'] });
test('resume validation trims editable content and preserves factual wording', () => {
  const result = parseResumeContent({ ...resume(), personalInfo: { fullName: '  Synthetic Candidate  ', summary: 'Built a small parser.\nTested its output.' } });
  assert.equal(result.personalInfo.fullName, 'Synthetic Candidate');
  assert.equal(result.personalInfo.summary, 'Built a small parser.\nTested its output.');
});
test('rejects owner injection, unbounded content, unsafe URLs and invalid nested types', () => {
  const invalid = [null, [], { ...resume(), userId: 'forged' }, { ...resume(), personalInfo: { fullName: '' } },
    { ...resume(), personalInfo: { fullName: 'A', linkedIn: 'javascript:alert(1)' } },
    { ...resume(), personalInfo: { fullName: 'A', linkedIn: 'https://user:password@example.invalid/' } },
    { ...resume(), personalInfo: { fullName: 'A', email: 'broken' } },
    { ...resume(), personalInfo: { fullName: 'A', summary: 'x'.repeat(5001) } },
    { ...resume(), experiences: [{ title: 'Role', company: { $ne: null } }] },
    { ...resume(), skills: Array(151).fill('Skill') }, { ...resume(), skills: [null] },
    { ...resume(), projects: [{ title: 'Project', techStack: [], link: 'file:///private.txt' }] }];
  for (const value of invalid) assert.throws(() => parseResumeContent(value), ResumeInputError);
});
test('save envelope accepts only content and an integer revision', () => {
  for (const revision of [-1, 1.5, '1', null, Infinity]) assert.throws(() => parseResumeSave({ content: resume(), revision }), ResumeInputError);
  assert.throws(() => parseResumeSave({ content: resume(), revision: 0, userId: 'other' }), ResumeInputError);
  assert.equal(parseResumeSave({ content: resume(), revision: 2 }).revision, 2);
});
test('extraction accepts absent optional strings without hiding invalid or unknown fields', () => {
  const { skills: _skills, ...raw } = resume();
  assert.equal(parseExtractedResume({ ...raw, personalInfo: { fullName: 'Synthetic Candidate', summary: null } }).personalInfo.summary, '');
  assert.throws(() => parseExtractedResume({ ...raw, unexpected: 'claim' }), ResumeInputError);
  assert.throws(() => parseExtractedResume({ ...raw, personalInfo: { fullName: null } }), ResumeInputError);
  assert.throws(() => parseExtractedResume({ ...raw, experiences: null }), ResumeInputError);
});
