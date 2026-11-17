import { test, expect, type Page } from '@playwright/test';
import type { IProfile, JobReview, JobVersion, WordingResult } from '../src/types';

const id = '507f1f77bcf86cd799439011'; const vid = '507f1f77bcf86cd799439012';
const original = 'Utilized React in order to build 3 screens with a teammate.\nAssisted with tests; did not lead the team.';
const proposed = 'Used React to build 3 screens with a teammate.\nAssisted with tests; did not lead the team.';
async function setup(page: Page, missing = false) {
  const base: IProfile = { profileId: id, revision: 0, personalInfo: { fullName: 'Synthetic Wording Candidate' }, experiences: [], education: [], skills: ['Docker'], projects: [{ title: 'Demo', techStack: ['React'], description: original }] };
  const requirements: JobReview['requirements'] = [
    { id: 'r:0', label: 'React', term: 'React', kind: 'skill', priority: 'required', quote: 'React is required.', status: missing ? 'not_found' : 'work_mention', evidence: missing ? [] : [{ id: 'project:0', label: 'Project 1: Demo', text: original }], action: 'Prepare a truthful example.' },
    { id: 'r:1', label: 'Docker', term: 'Docker', kind: 'skill', priority: 'preferred', quote: 'Docker is preferred.', status: 'claim_only', evidence: [], action: 'Describe real experience if you have it.' },
  ];
  const version: JobVersion = { ...structuredClone(base), profileId: vid, revision: 1, baseRevision: 0, createdAt: '2026-11-18T06:00:00Z', label: 'Synthetic wording job', jobDescription: 'React is required. Docker is preferred.', gapPlans: [], plansRevision: 0,
    analysis: { schemaVersion: 1, revision: 1, generatedAt: '2026-11-18T06:00:00Z', requirements, suggestions: [], usage: { model: 'synthetic', inputTokens: 100, outputTokens: 40 } } };
  let calls = 0; let saves = 0; let mode: 'ready' | 'empty' | 'failed' | 'stale' = 'ready'; let wait: Promise<void> | undefined;
  await page.route('**/api/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname;
    if (!path.startsWith('/api/')) return route.continue();
    const respond = (data: unknown, status = 200) => route.fulfill({ status, json: { success: status < 400, data } });
    if (path.startsWith('/api/auth/')) return respond({ token: 'synthetic-session' });
    expect(req.headers().authorization).toBe('Bearer synthetic-session');
    if (path.endsWith('/me')) return respond(base);
    const root = `/api/profile/${id}/versions`; const target = `${root}/${vid}`;
    if (path === root) return respond([version]);
    if (path === target + '/wording') {
      calls++;
      expect(req.postDataJSON()).toEqual({ revision: version.revision, reviewedAt: version.analysis!.generatedAt, sourceId: 'project:0', requirementId: 'r:0', consent: true });
      if (wait) await wait;
      if (mode === 'failed' || mode === 'stale') return route.fulfill({ status: mode === 'failed' ? 503 : 409, json: { code: mode === 'failed' ? 'invalid_output' : undefined, error: mode === 'failed' ? 'The proposed wording did not pass the source checks. Your resume is unchanged.' : 'The saved resume changed. Reload before trying again.' } });
      const result: WordingResult = { revision: version.revision, reviewedAt: version.analysis!.generatedAt, generatedAt: '2026-11-18T06:01:00Z', requirement: { id: 'r:0', label: 'React', quote: 'React is required.' },
        suggestion: mode === 'empty' ? null : { id: `wording:${calls}`, sourceId: 'project:0', sourceLabel: 'Project 1: Demo', original: version.projects[0]!.description!, proposed, reason: 'Review the contribution and meaning against the original.' }, usage: { model: 'synthetic', inputTokens: 120, outputTokens: 35 } };
      return respond(result);
    }
    if (path === target + '/export') {
      expect(url.searchParams.get('revision')).toBe(String(version.revision));
      return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\nsynthetic saved fixture' });
    }
    if (path === target) {
      if (req.method() === 'PUT') {
        saves++; const body = req.postDataJSON(); expect(body.revision).toBe(version.revision); Object.assign(version, body.content); version.revision++;
        version.analysis = { ...version.analysis!, revision: version.revision, generatedAt: `2026-11-18T06:0${version.revision}:00Z`, requirements: [{ ...requirements[0]!, evidence: [{ id: 'project:0', label: 'Project 1: Demo', text: version.projects[0]!.description! }] }, requirements[1]!] };
      }
      return respond(version);
    }
    throw Error(`Unexpected ${req.method()} ${path}`);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.invalid'); await page.getByLabel('Password', { exact: true }).fill('synthetic password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Tailor for a job' }).click(); await page.getByRole('button', { name: 'Open Synthetic wording job' }).click();
  return { base, version, calls: () => calls, saves: () => saves, mode: (next: typeof mode) => { mode = next; },
    hold: () => { let release!: () => void; wait = new Promise<void>(resolve => { release = resolve; }); return () => { wait = undefined; release(); }; } };
}
const wording = (page: Page) => page.getByRole('region', { name: 'Review wording improvements', exact: true });
const proposal = (page: Page) => page.getByRole('article', { name: 'Wording proposal', exact: true });
async function choose(page: Page) {
  await wording(page).getByRole('combobox', { name: 'Section and job requirement' }).selectOption('r:0|project:0');
  await wording(page).getByLabel('Send this description and job quote for wording suggestions').check();
}

test('consented request, original comparison, explicit factual approval, edited draft, save/reopen and PDF export', async ({ page }, info) => {
  const api = await setup(page);
  await expect(wording(page).getByRole('button', { name: 'Suggest clearer wording' })).toBeDisabled(); expect(api.calls()).toBe(0);
  await wording(page).getByRole('combobox').selectOption('r:0|project:0');
  await wording(page).getByText(/Description that will be sent/).click();
  await expect(wording(page).locator('details').first()).toContainText(original);
  await expect(wording(page).getByRole('button', { name: 'Suggest clearer wording' })).toBeDisabled();
  await wording(page).getByLabel('Send this description and job quote for wording suggestions').check();
  const release = api.hold();
  try {
    await wording(page).getByRole('button', { name: 'Suggest clearer wording' }).click();
    await expect(page.getByLabel('Summary', { exact: true })).toBeDisabled();
    await expect(wording(page).getByRole('button', { name: 'Checking wording…' })).toBeDisabled();
  } finally { release(); }
  await expect(proposal(page)).toContainText(original); await expect(proposal(page)).toContainText(proposed);
  expect(api.version.projects[0]!.description).toBe(original); expect(api.saves()).toBe(0);
  await expect(proposal(page).getByRole('button', { name: 'Accept wording into draft' })).toBeDisabled();
  await proposal(page).getByLabel('I checked the facts, ownership of the work, and meaning').check();
  await proposal(page).getByRole('button', { name: 'Edit proposed wording' }).click();
  const edited = proposed + '\nMy own truthful wording, subject to my review.';
  await proposal(page).getByLabel('Your edited wording').fill(edited);
  await expect(proposal(page).getByLabel('I checked the facts, ownership of the work, and meaning')).not.toBeChecked();
  await proposal(page).getByLabel('I checked the facts, ownership of the work, and meaning').check();
  await proposal(page).getByRole('button', { name: 'Accept wording into draft' }).click();
  await expect(page.getByLabel('What you built and your contribution')).toHaveValue(edited);
  expect(api.version.projects[0]!.description).toBe(original);
  await page.getByRole('button', { name: 'Save changes', exact: true }).first().click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  expect(api.version.projects[0]!.description).toBe(edited); expect(api.base.projects[0]!.description).toBe(original);
  await page.getByRole('button', { name: 'All job versions' }).click(); await page.getByRole('button', { name: 'Open Synthetic wording job' }).click();
  await expect(page.getByLabel('What you built and your contribution')).toHaveValue(edited);
  await page.getByRole('button', { name: 'Preview saved PDF', exact: true }).click();
  const preview = page.getByTitle('Saved resume PDF'); await expect(preview).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download this PDF' })).toHaveAttribute('href', (await preview.getAttribute('src'))!);
  expect(api.calls()).toBe(1); expect(api.saves()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await wording(page).screenshot({ path: `test-results/wording-saved-${info.project.name}.png` });
});

test('pending proposals protect navigation; stale local source cannot be overwritten and rejection preserves drafts', async ({ page }, info) => {
  const api = await setup(page); await choose(page); await wording(page).getByRole('button', { name: 'Suggest clearer wording' }).click();
  await expect(proposal(page)).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'All job versions' }).click();
  await expect(proposal(page)).toBeVisible();
  await wording(page).screenshot({ path: `test-results/wording-proposal-${info.project.name}.png` });
  await page.getByLabel('What you built and your contribution').fill('My newer unsaved project description.');
  await proposal(page).getByLabel('I checked the facts, ownership of the work, and meaning').check();
  await proposal(page).getByRole('button', { name: 'Accept wording into draft' }).click();
  await expect(page.getByRole('alert')).toContainText('This section has changed');
  await proposal(page).getByRole('button', { name: 'Reject wording' }).click();
  await expect(page.getByLabel('What you built and your contribution')).toHaveValue('My newer unsaved project description.');
  expect(api.version.projects[0]!.description).toBe(original); expect(api.saves()).toBe(0);
});

test('empty/invalid responses do not change the resume; stale request recovery reloads explicitly', async ({ page }) => {
  const api = await setup(page); await choose(page); api.mode('empty');
  await wording(page).getByRole('button', { name: 'Suggest clearer wording' }).click();
  await expect(wording(page).getByText(/No useful wording edit passed/)).toBeVisible();
  api.mode('failed'); await wording(page).getByRole('button', { name: 'Suggest clearer wording' }).click();
  await expect(wording(page).getByRole('alert')).toContainText('did not pass the source checks');
  api.mode('stale'); await wording(page).getByRole('button', { name: 'Suggest clearer wording' }).click();
  await expect(wording(page).getByRole('alert')).toContainText('Reload before trying again');
  await page.getByLabel('Summary', { exact: true }).fill('Keep my unsaved summary.');
  page.once('dialog', dialog => dialog.dismiss()); await wording(page).getByRole('button', { name: 'Reload saved wording source' }).click();
  await expect(page.getByLabel('Summary', { exact: true })).toHaveValue('Keep my unsaved summary.');
  page.once('dialog', dialog => dialog.accept()); await wording(page).getByRole('button', { name: 'Reload saved wording source' }).click();
  await expect(page.getByLabel('Summary', { exact: true })).toHaveValue('');
  await expect(wording(page).getByRole('alert')).toHaveCount(0); expect(api.saves()).toBe(0);
  expect(api.version.projects[0]!.description).toBe(original);
});

test('missing evidence prompts real details without an AI request or fabricated text', async ({ page }) => {
  const api = await setup(page, true);
  await expect(wording(page).getByText(/No eligible work mention yet/)).toBeVisible();
  await wording(page).getByText('Details to add yourself (2)', { exact: true }).click();
  await expect(wording(page)).toContainText('what did you personally build or change');
  await wording(page).getByRole('button', { name: 'Add real evidence in editor' }).click();
  await expect(page.getByLabel('What you built and your contribution')).toBeFocused();
  expect(api.calls()).toBe(0); expect(api.saves()).toBe(0); expect(api.version.projects[0]!.description).toBe(original);
});
