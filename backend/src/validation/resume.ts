import type { IPersonalInfo, IExperience, IEducation, IProject } from '../models/Profile.js';

export interface ResumeContent {
  personalInfo: IPersonalInfo;
  experiences: IExperience[];
  education: IEducation[];
  projects: IProject[];
  skills: string[];
}

export class ResumeInputError extends Error {}
export { object as inputObject, string as inputText };

function object(value: unknown, allowed: string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ResumeInputError(`${path} must be an object`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !allowed.includes(key))) throw new ResumeInputError(`${path} contains unsupported fields`);
  return result;
}

function string(value: unknown, path: string, required = false, max = 300): string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    throw new ResumeInputError(`${path} must be text of at most ${max} characters`);
  }
  const result = value.trim();
  if (required && !result) throw new ResumeInputError(`${path} is required`);
  return result;
}

function url(value: unknown, path: string) {
  const result = string(value, path, false, 1000);
  if (!result) return '';
  try {
    const parsed = new URL(result);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
  } catch { throw new ResumeInputError(`${path} must be a full http or https URL without credentials`); }
  return result;
}

function list<T>(value: unknown, path: string, max: number, parse: (item: unknown, path: string) => T): T[] {
  if (!Array.isArray(value) || value.length > max) throw new ResumeInputError(`${path} must be a list of at most ${max} items`);
  return value.map((item, index) => parse(item, `${path} ${index + 1}`));
}

export function parseResumeContent(value: unknown): ResumeContent {
  const input = object(value, ['personalInfo', 'experiences', 'education', 'projects', 'skills'], 'Resume');
  const p = object(input.personalInfo, ['fullName', 'email', 'phone', 'location', 'linkedIn', 'summary'], 'Contact');
  const email = string(p.email, 'Email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ResumeInputError('Enter a valid email address');
  return {
    personalInfo: {
      fullName: string(p.fullName, 'Full name', true), email,
      phone: string(p.phone, 'Phone'), location: string(p.location, 'Location'),
      linkedIn: url(p.linkedIn, 'LinkedIn'), summary: string(p.summary, 'Summary', false, 5000),
    },
    skills: list(input.skills, 'Skills', 150, (item, path) => string(item, path, true, 100)),
    experiences: list(input.experiences, 'Experience', 30, (item, path) => {
      const x = object(item, ['title', 'company', 'location', 'startDate', 'endDate', 'description'], path);
      return { title: string(x.title, `${path} title`, true), company: string(x.company, `${path} company`, true),
        location: string(x.location, `${path} location`), startDate: string(x.startDate, `${path} start date`, false, 100),
        endDate: string(x.endDate, `${path} end date`, false, 100), description: string(x.description, `${path} description`, false, 10000) };
    }),
    education: list(input.education, 'Education', 20, (item, path) => {
      const x = object(item, ['institution', 'degree', 'field', 'startDate', 'endDate', 'gpa'], path);
      return { institution: string(x.institution, `${path} institution`, true), degree: string(x.degree, `${path} degree`, true),
        field: string(x.field, `${path} field`), startDate: string(x.startDate, `${path} start date`, false, 100),
        endDate: string(x.endDate, `${path} end date`, false, 100), gpa: string(x.gpa, `${path} grade`, false, 100) };
    }),
    projects: list(input.projects, 'Projects', 30, (item, path) => {
      const x = object(item, ['title', 'description', 'techStack', 'link'], path);
      return { title: string(x.title, `${path} title`, true), description: string(x.description, `${path} description`, false, 10000),
        link: url(x.link, `${path} link`), techStack: list(x.techStack, `${path} technologies`, 50, (item, path) => string(item, path, true, 100)) };
    }),
  };
}

export function parseResumeSave(value: unknown) {
  const body = object(value, ['content', 'revision'], 'Request');
  if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 0) throw new ResumeInputError('Revision must be a non-negative integer');
  return { content: parseResumeContent(body.content), revision: body.revision as number };
}

/** Providers represent absent optional strings as null; HTTP edits use strings.
 * Required fields, missing arrays and unknown keys still fail the same schema. */
export function parseExtractedResume(value: unknown): Omit<ResumeContent, 'skills'> {
  function optionalNulls(input: unknown): unknown {
    if (input === null) return undefined;
    if (Array.isArray(input)) return input.map(optionalNulls);
    if (typeof input === 'object' && input) return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, optionalNulls(item)]));
    return input;
  }
  const parsed = object(optionalNulls(value), ['personalInfo', 'experiences', 'education', 'projects'], 'Extracted resume');
  const { skills: _skills, ...result } = parseResumeContent({ ...parsed, skills: [] });
  return result;
}
