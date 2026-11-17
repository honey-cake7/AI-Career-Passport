import { test, expect, type Page } from '@playwright/test';
import type { JobCoverage, JobReview, JobVersion, IProfile } from '../src/types';

const id = '507f1f77bcf86cd799439011'; const vid = '507f1f77bcf86cd799439012';
const jd = 'React and Docker are required. Kubernetes is preferred. A degree is required. React.js is preferred. Node.js is optional.';
type Requirement = JobReview['requirements'][number];
type Row = Pick<Requirement, 'label' | 'quote' | 'kind' | 'term' | 'priority'> & { id?: string; excluded?: boolean };
const group = (values: Partial<JobCoverage['groups']['required']> = {}): JobCoverage['groups']['required'] => ({ assessed: 0, workMentions: 0, listedOnly: 0, notFound: 0, unassessed: 0, excluded: 0, duplicates: 0, workPercent: null, ...values });
const initialCoverage = (): JobCoverage => ({ schemaVersion: 1, groups: {
  required: group({ assessed: 2, workMentions: 1, listedOnly: 1, unassessed: 1, workPercent: 50 }),
  preferred: group({ assessed: 1, notFound: 1, duplicates: 1, workPercent: 0 }), unspecified: group(),
}, duplicates: [{ id: 'r:4', countedAs: 'r:0' }] });
const initialRows: Row[] = [
  { label: 'React', term: 'React', quote: 'React and Docker are required.', kind: 'skill', priority: 'required' },
  { label: 'Docker', term: 'Docker', quote: 'React and Docker are required.', kind: 'skill', priority: 'required' },
  { label: 'Kubernetes', term: 'Kubernetes', quote: 'Kubernetes is preferred.', kind: 'skill', priority: 'preferred' },
  { label: 'Degree', term: '', quote: 'A degree is required.', kind: 'context', priority: 'required' },
  { label: 'React.js', term: 'React.js', quote: 'React.js is preferred.', kind: 'skill', priority: 'preferred' },
];
async function setup(page: Page, manual = false) {
  const base: IProfile = { profileId: id, revision: 0, personalInfo: { fullName: 'Synthetic Candidate' }, experiences: [], education: [], skills: ['Docker'],
    projects: [{ title: 'Demo', description: 'Built a React interface.', techStack: ['React'] }] };
  const version: JobVersion = { ...structuredClone(base), profileId: vid, revision: 0, label: 'Synthetic coverage role', jobDescription: jd,
    baseRevision: 0, createdAt: '2026-11-17T12:00:00Z', analysis: null, gapPlans: [], plansRevision: 0 };
  let nextCoverage = initialCoverage(); let fail = false; let conflict = false; let calls = 0; let saves = 0;
  let waitForSave: Promise<void> | undefined;
  function assessed(rows: Row[]): Requirement[] {
    return rows.map((row, i) => {
      const previous = version.analysis?.requirements.find(r => r.id === row.id);
      const status = row.kind === 'context' || row.excluded ? 'unassessed' : row.term.startsWith('React') ? 'work_mention' : row.term === 'Docker' ? version.projects[0]!.description!.includes('Docker') ? 'work_mention' : 'claim_only' : 'not_found';
      return { ...row, id: row.id ?? `new:${i}`, origin: previous?.origin ?? (row.id ? 'model' : 'user'),
        ...(previous && previous.priority !== row.priority ? { original: previous.original ?? { id: previous.id, label: previous.label, quote: previous.quote, kind: previous.kind, term: previous.term, priority: previous.priority } } : previous?.original ? { original: previous.original } : {}),
        status, evidence: status === 'work_mention' ? [{ id: 'project:0', label: 'Project 1: Demo', text: version.projects[0]!.description! }] : [], action: 'Inspect the saved wording and prepare a truthful example.' };
    });
  }
  function review(rows: Row[]): JobReview {
    return { schemaVersion: 1, revision: version.revision, generatedAt: new Date(Date.UTC(2026, 10, 17, 12, 0, 0, version.revision)).toISOString(),
      requirements: assessed(rows), suggestions: [], coverage: structuredClone(nextCoverage), usage: { model: manual ? 'manual' : 'synthetic', inputTokens: manual ? null : 100, outputTokens: manual ? null : 50 } };
  }
  if (!manual) version.analysis = review(initialRows.map((row, i) => ({ ...row, id: `r:${i}` })));
  await page.route('**/api/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname;
    if (!path.startsWith('/api/')) return route.continue();
    const respond = (data: unknown, status = 200) => route.fulfill({ status, json: { success: status < 400, data } });
    if (path.startsWith('/api/auth/')) return respond({ token: 'synthetic-session' });
    expect(req.headers().authorization).toBe('Bearer synthetic-session');
    if (path.endsWith('/me')) return respond(base);
    const root = `/api/profile/${id}/versions`; const target = `${root}/${vid}`;
    if (path === root) return respond([version]);
    if (path === target + '/review') { calls++; throw Error('No provider call expected for saved/manual requirements'); }
    if (path === target + '/requirements') {
      const body = req.postDataJSON(); saves++;
      expect(Object.keys(body).sort()).toEqual(['requirements', 'reviewedAt', 'revision']);
      expect(body.revision).toBe(version.revision); expect(body.reviewedAt).toBe(version.analysis?.generatedAt ?? null);
      for (const row of body.requirements) expect(Object.keys(row).every(key => ['id', 'label', 'quote', 'kind', 'term', 'priority', 'excluded'].includes(key))).toBe(true);
      if (fail || conflict) return route.fulfill({ status: conflict ? 409 : 400, json: { error: conflict ? 'This version changed. Your requirement edits are still here.' : 'The requirement quote must be copied exactly from the saved job description' } });
      if (waitForSave) await waitForSave;
      version.revision++; version.analysis = review(body.requirements); return respond(version);
    }
    if (path === target + '/export') {
      expect(url.searchParams.get('revision')).toBe(String(version.revision));
      return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\nsynthetic saved resume fixture' });
    }
    if (path === target) {
      if (req.method() === 'PUT') {
        const body = req.postDataJSON(); expect(body.revision).toBe(version.revision);
        const requirements = version.analysis?.requirements;
        Object.assign(version, body.content); version.revision++;
        if (requirements) version.analysis = review(requirements);
      }
      return respond(version);
    }
    throw Error(`Unexpected request ${req.method()} ${path}`);
  });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.invalid'); await page.getByLabel('Password', { exact: true }).fill('synthetic password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Tailor for a job' }).click(); await page.getByRole('button', { name: 'Open Synthetic coverage role' }).click();
  return { base, version, setCoverage: (value: JobCoverage) => { nextCoverage = value; }, fail: (value: boolean) => { fail = value; },
    conflict: (value: boolean) => { conflict = value; }, calls: () => calls, saves: () => saves,
    holdSave: () => { let release!: () => void; waitForSave = new Promise<void>(resolve => { release = resolve; }); return () => { waitForSave = undefined; release(); }; } };
}
const required = (page: Page) => page.getByRole('article', { name: 'required coverage', exact: true });
const preferred = (page: Page) => page.getByRole('article', { name: 'preferred coverage', exact: true });
const editorRow = (page: Page, n: number) => page.getByRole('article', { name: `Requirement ${n}`, exact: true });

test('correct requirements, save coverage, edit evidence, export and reopen without another AI request', async ({ page }, info) => {
  const api = await setup(page);
  await expect(required(page).locator('.coverage-value')).toHaveText('50%');
  await expect(required(page)).toContainText('1 of 2 assessed skills mentioned in work');
  await page.getByText('How these percentages work', { exact: true }).click();
  await expect(page.getByText(/not a claim that every requirement/)).toBeVisible();
  await page.getByText('Edit job requirements', { exact: true }).click();
  await editorRow(page, 2).getByRole('combobox', { name: 'Priority', exact: true }).selectOption('preferred');
  await editorRow(page, 3).getByLabel('Exclude from this comparison').check();
  await page.getByRole('button', { name: '+ Add requirement', exact: true }).click();
  const added = editorRow(page, 6);
  await added.getByLabel('Requirement label').fill('Node.js'); await added.getByLabel('Exact job quote').fill('Node.js is optional.');
  await added.getByLabel('Exact skill name in quote').fill('Node.js');
  const editedCoverage: JobCoverage = { schemaVersion: 1, groups: {
    required: group({ assessed: 1, workMentions: 1, unassessed: 1, workPercent: 100 }),
    preferred: group({ assessed: 1, listedOnly: 1, excluded: 1, duplicates: 1, workPercent: 0 }),
    unspecified: group({ assessed: 1, notFound: 1, workPercent: 0 }),
  }, duplicates: [{ id: 'r:4', countedAs: 'r:0' }] };
  api.setCoverage(editedCoverage);
  await expect(page.getByText('Showing the saved version. Save your edits to recalculate.')).toBeVisible();
  const release = api.holdSave();
  try {
    await page.getByRole('button', { name: 'Save requirements', exact: true }).click();
    await expect(page.getByLabel('Summary', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Saving requirements…', exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(required(page).locator('.coverage-value')).toHaveText('100%');
  expect(api.version.analysis!.requirements[1]!.priority).toBe('preferred');
  expect(api.version.analysis!.requirements[1]!.original!.priority).toBe('required');
  expect(api.base.revision).toBe(0); expect(api.calls()).toBe(0);
  await page.getByLabel('What you built and your contribution').fill('Built a React interface.\nPackaged the demo with Docker.');
  api.setCoverage({ ...editedCoverage, groups: { ...editedCoverage.groups, preferred: group({ assessed: 1, workMentions: 1, excluded: 1, duplicates: 1, workPercent: 100 }) } });
  await page.getByRole('button', { name: 'Save changes', exact: true }).first().click();
  await expect(preferred(page).locator('.coverage-value')).toHaveText('100%');
  await page.getByRole('button', { name: 'All job versions' }).click(); await page.getByRole('button', { name: 'Open Synthetic coverage role' }).click();
  await expect(preferred(page).locator('.coverage-value')).toHaveText('100%');
  await page.getByRole('region', { name: 'Resume coverage', exact: true }).screenshot({ path: `test-results/coverage-${info.project.name}.png` });
  await page.getByRole('button', { name: 'Preview saved PDF', exact: true }).click();
  const preview = page.getByTitle('Saved resume PDF'); await expect(preview).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download this PDF' })).toHaveAttribute('href', (await preview.getAttribute('src'))!);
  expect(api.calls()).toBe(0); expect(api.saves()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('invalid and stale edits survive errors and navigation; reload is explicit even at the same resume revision', async ({ page }) => {
  const api = await setup(page);
  await page.getByText('Edit job requirements', { exact: true }).click();
  const row = editorRow(page, 1);
  await row.getByLabel('Exact job quote').fill('Invented quote'); api.fail(true);
  await page.getByRole('button', { name: 'Save requirements', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('copied exactly');
  await expect(row.getByLabel('Exact job quote')).toHaveValue('Invented quote');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'All job versions' }).click();
  await expect(row.getByLabel('Exact job quote')).toHaveValue('Invented quote');
  api.fail(false); api.conflict(true); await row.getByLabel('Exact job quote').fill('React and Docker are required.');
  await row.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('preferred');
  await page.getByRole('button', { name: 'Save requirements', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your requirement edits are still here');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Reload saved job version' }).click();
  await expect(row.getByRole('combobox', { name: 'Priority', exact: true })).toHaveValue('preferred');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reload saved job version' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByText('Edit job requirements', { exact: true }).click();
  await expect(row.getByRole('combobox', { name: 'Priority', exact: true })).toHaveValue('required');
  await expect(page.getByRole('button', { name: 'Save requirements', exact: true })).toBeDisabled();
});

test('manual context requirements need no AI and show an unavailable percentage instead of zero', async ({ page }) => {
  const api = await setup(page, true);
  await page.getByText('Add requirements yourself', { exact: true }).click();
  await page.getByRole('button', { name: '+ Add requirement', exact: true }).click();
  const row = editorRow(page, 1);
  await row.getByLabel('Requirement label').fill('Degree'); await row.getByLabel('Exact job quote').fill('A degree is required.');
  await row.getByRole('combobox', { name: 'Requirement type', exact: true }).selectOption('context'); await row.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('required');
  api.setCoverage({ schemaVersion: 1, groups: { required: group({ unassessed: 1 }), preferred: group(), unspecified: group() }, duplicates: [] });
  await page.getByLabel('Summary', { exact: true }).fill('Unsaved resume edit.');
  await expect(page.getByRole('button', { name: 'Save requirements', exact: true })).toBeDisabled();
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Discard edits', exact: true }).click();
  await expect(row.getByLabel('Requirement label')).toHaveValue('Degree');
  await page.getByRole('button', { name: 'Save requirements', exact: true }).click();
  await expect(required(page).locator('.coverage-value')).toHaveText('Not available');
  await expect(required(page)).toContainText('0 of 0 assessed skills mentioned in work');
  expect(api.calls()).toBe(0); expect(api.version.analysis!.requirements[0]!.origin).toBe('user');
});
