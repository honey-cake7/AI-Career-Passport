import { test, expect, type Page } from '@playwright/test';
import type { GapPlan, IProfile, JobVersion, JobReview } from '../src/types';

const id = '507f1f77bcf86cd799439011';
const versionId = '507f1f77bcf86cd799439012';
const jd = 'React and Docker are required. Kubernetes is preferred. At least 3 years of experience.';
const original = 'Wrote tests for a parser.\nBuilt a React interface.';
function analysis(v: JobVersion): JobReview {
  return { schemaVersion: 1, revision: v.revision, generatedAt: '2026-11-17T10:00:00Z',
    usage: { model: 'synthetic', inputTokens: 100, outputTokens: 80 },
    requirements: [
      { id: 'requirement:0', label: 'React', quote: 'React and Docker are required.', kind: 'skill', term: 'React', priority: 'required', status: 'work_mention', evidence: [{ id: 'project:0', label: 'Project 1: UI Portfolio', text: 'Built a React interface.' }], action: 'Prepare an example of your React contribution.' },
      { id: 'requirement:1', label: 'Docker', quote: 'React and Docker are required.', kind: 'skill', term: 'Docker', priority: 'required', status: 'claim_only', evidence: [], action: 'Add a truthful project or experience example using Docker.' },
      { id: 'requirement:2', label: 'Kubernetes', quote: 'Kubernetes is preferred.', kind: 'skill', term: 'Kubernetes', priority: 'preferred', status: 'not_found', evidence: [], action: 'If you have used Kubernetes, describe one concrete example. Otherwise complete and test a small project task before claiming it.' },
      { id: 'requirement:3', label: '3 years of experience', quote: 'At least 3 years of experience.', kind: 'context', term: '', priority: 'required', status: 'unassessed', evidence: [], action: 'Check duration and depth of experience yourself.' },
    ], suggestions: v.revision > 0 ? [] : [{ id: 'suggestion:0', sourceId: 'project:0', sourceLabel: 'Project 1: UI Portfolio', original, proposed: 'Built a React interface.\nWrote tests for a parser.', reason: 'Bring the existing React contribution first. All original lines are retained.' }] };
}

async function setup(page: Page) {
  const base: IProfile = { profileId: id, revision: 0, personalInfo: { fullName: 'Synthetic Candidate' }, skills: ['Docker'], experiences: [], education: [], projects: [{ title: 'UI Portfolio', techStack: ['React'], description: original }] };
  let version: JobVersion | null = null;
  let failReview = false;
  let reviewCalls = 0;
  let conflictPlan = false;
  await page.route('**/api/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname;
    if (!path.startsWith('/api/')) return route.continue();
    const response = (data: unknown, status = 200) => route.fulfill({ status, json: { success: status < 400, data } });
    if (path.startsWith('/api/auth/')) return response({ token: 'synthetic-session' });
    expect(req.headers().authorization).toBe('Bearer synthetic-session');
    if (path.endsWith('/me')) return response(base);
    const root = `/api/profile/${id}/versions`;
    if (path === root) {
      if (req.method() === 'GET') return response(version ? [version] : []);
      const body = req.postDataJSON(); expect(body.revision).toBe(0);
      version = { ...structuredClone(base), profileId: versionId, label: body.label, jobDescription: body.jobDescription, baseRevision: 0, createdAt: '2026-11-17T10:00:00Z', analysis: null, gapPlans: [], plansRevision: 0 };
      return response(version, 201);
    }
    if (path === `${root}/${versionId}/review`) {
      reviewCalls++;
      if (failReview) return route.fulfill({ status: 503, json: { success: false, code: 'unavailable', error: 'Job review is temporarily unavailable. Your saved version is unchanged.' } });
      version!.analysis = analysis(version!); return response(version!.analysis);
    }
    if (path.startsWith(`${root}/${versionId}/plans`)) {
      const state = () => ({ gapPlans: version!.gapPlans, plansRevision: version!.plansRevision, revision: version!.revision });
      if (req.method() === 'GET') return response(state());
      const body = req.postDataJSON();
      if (conflictPlan) { conflictPlan = false; return route.fulfill({ status: 409, json: { error: 'The resume or its plans changed. Reload before saving; your current notes have not been saved.' } }); }
      expect(body.revision).toBe(version!.revision); expect(body.plansRevision).toBe(version!.plansRevision);
      if (path.endsWith('/plans')) {
        const r = version!.analysis!.requirements.find(r => r.id === body.requirementId)!;
        const plan: GapPlan = { id: `507f1f77bcf86cd7994390${20 + version!.gapPlans!.length}`, requirementKey: r.term, requirement: r, confirmation: body.confirmation,
          task: `Package one existing project feature with ${r.term}`, criteria: ['Build and start the demo.', 'Keep secrets outside the image.', 'Check the running feature.'], checks: [false, false, false], status: 'planned', notes: '', link: '', createdAt: '2026-11-17T10:00:00Z', updatedAt: '2026-11-17T10:00:00Z',
          assessment: { revision: version!.revision, checkedAt: '2026-11-17T10:00:00Z', status: r.status, evidence: r.evidence } };
        version!.gapPlans!.push(plan);
      } else {
        const planId = path.split('/plans/')[1]!.split('/')[0]!;
        const index = version!.gapPlans!.findIndex(p => p.id === planId); const plan = version!.gapPlans![index]!;
        if (req.method() === 'DELETE') version!.gapPlans!.splice(index, 1);
        else if (path.endsWith('/reassess')) plan.assessment = { ...plan.assessment, revision: version!.revision, status: version!.projects[0]?.description?.includes('Docker') ? 'work_mention' : 'claim_only' };
        else {
          if (body.plan.status === 'completed' && (!body.plan.notes.trim() || body.plan.checks.some((value: boolean) => !value))) return route.fulfill({ status: 400, json: { error: 'To record completion, check every criterion and describe what you actually did.' } });
          version!.gapPlans![index] = { ...plan, ...body.plan };
        }
      }
      version!.plansRevision!++; return response(state());
    }
    if (path.endsWith('/export')) {
      expect(url.searchParams.get('revision')).toBe(String(version!.revision));
      return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\nsynthetic tailored download fixture' });
    }
    if (path === `${root}/${versionId}`) {
      if (req.method() === 'DELETE') { version = null; return route.fulfill({ status: 204 }); }
      if (req.method() === 'PUT') { const body = req.postDataJSON(); expect(body.revision).toBe(version!.revision); version = { ...version!, ...body.content, revision: version!.revision + 1, analysis: null }; }
      return response(version);
    }
    throw new Error(`Unexpected request: ${req.method()} ${path}`);
  });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Tailor for a job' }).click();
  return { base, version: () => version, fail: (value: boolean) => { failReview = value; }, calls: () => reviewCalls, conflict: () => { conflictPlan = true; } };
}
async function create(page: Page) {
  await page.getByLabel('Version name').fill('Frontend developer · Example');
  await page.getByLabel('Job description', { exact: true }).fill(jd);
  await page.getByRole('button', { name: 'Create job version', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review this job', exact: true })).toBeVisible();
}

test('JD review, gap actions, reject/edit/accept, saved version export, reopen and base preservation', async ({ page }, info) => {
  const api = await setup(page); await create(page);
  expect(api.calls()).toBe(0);
  await page.getByRole('button', { name: 'Review this job', exact: true }).click();
  for (const text of ['Mentioned in work', 'Listed without an example', 'Not found in this resume', 'Cannot assess automatically']) await expect(page.getByText(text, { exact: true })).toBeVisible();
  const gap = page.locator('.requirement-card').filter({ has: page.getByRole('heading', { name: 'Kubernetes', exact: true }) });
  await gap.getByText('Choose a next step', { exact: true }).click();
  await expect(gap.getByText(/If you have used Kubernetes/)).toBeVisible();
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByText('Rejected. Your resume was not changed.')).toBeVisible();
  await page.getByRole('button', { name: 'Reconsider', exact: true }).click();
  await page.getByRole('button', { name: 'Edit wording', exact: true }).click();
  const edited = 'Built a React interface.\nWrote regression tests for a parser.';
  await page.getByLabel('Your proposed wording').fill(edited);
  await page.getByRole('button', { name: 'Use edited text in draft' }).click();
  await expect(page.getByLabel('What you built and your contribution')).toHaveValue(edited);
  await expect(page.getByRole('button', { name: 'Preview saved PDF', exact: true })).toBeDisabled();
  expect(api.base.projects[0]!.description).toBe(original);
  await page.getByRole('button', { name: 'Save changes', exact: true }).first().click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  expect(api.version()?.projects[0]!.description).toBe(edited); expect(api.version()?.analysis).toBeNull();
  await page.getByRole('button', { name: 'Review this job', exact: true }).click();
  await expect(page.getByText('No safe line-reordering suggestions found.', { exact: false })).toBeVisible();
  await page.screenshot({ path: `test-results/job-review-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Preview saved PDF', exact: true }).click();
  const preview = page.getByTitle('Saved resume PDF'); await expect(preview).toBeVisible();
  const link = page.getByRole('link', { name: 'Download this PDF' }); await expect(link).toHaveAttribute('href', (await preview.getAttribute('src'))!);
  const download = page.waitForEvent('download'); await link.click(); expect((await download).suggestedFilename()).toBe('tailored-resume.pdf');
  await page.getByRole('button', { name: 'Base resume', exact: true }).click();
  await expect(page.getByLabel('What you built and your contribution')).toHaveValue(original);
  await page.getByRole('button', { name: 'Tailor for a job' }).click();
  await page.getByRole('button', { name: 'Open Frontend developer · Example' }).click();
  await expect(page.getByLabel('What you built and your contribution')).toHaveValue(edited);
  const width = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Delete job version' }).click();
  await expect(page.getByRole('heading', { name: 'Create a job version' })).toBeVisible(); expect(api.version()).toBeNull(); expect(api.base.projects[0]!.description).toBe(original);
});

test('failed review can retry and a changed draft cannot be overwritten by an old suggestion', async ({ page }) => {
  const api = await setup(page); await create(page); api.fail(true);
  await page.getByRole('button', { name: 'Review this job', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your saved version is unchanged');
  api.fail(false); await page.getByRole('button', { name: 'Review this job', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use suggestion in draft' })).toBeVisible();
  await page.getByLabel('What you built and your contribution').fill('My newer unsaved wording.');
  await page.getByRole('button', { name: 'Use suggestion in draft' }).click();
  await expect(page.getByRole('alert')).toContainText('This section has changed');
  await expect(page.getByLabel('What you built and your contribution')).toHaveValue('My newer unsaved wording.');
  expect(api.version()?.projects[0]!.description).toBe(original);
});

async function dockerPlan(page: Page) {
  const api = await setup(page); await create(page);
  await page.getByRole('button', { name: 'Review this job', exact: true }).click();
  const requirement = page.locator('.requirement-card').filter({ has: page.getByRole('heading', { name: 'Docker', exact: true }) });
  await requirement.getByText('Choose a next step', { exact: true }).click();
  await requirement.getByLabel('What is true for you?').selectOption('needs_practice');
  await requirement.getByRole('button', { name: 'Save a focused plan' }).click();
  const plan = page.getByRole('article', { name: 'Plan for Docker' });
  await expect(plan.getByLabel('Focused task')).toBeVisible();
  return { api, plan };
}

test('saved plans require an outcome, survive reopening, and reassess only saved resume evidence', async ({ page }, info) => {
  const { api, plan } = await dockerPlan(page);
  await plan.getByLabel('Focused task').fill('Package my existing parser demo with Docker');
  await plan.getByLabel('Task status').selectOption('completed');
  await plan.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('check every criterion');
  expect(api.version()!.gapPlans![0]!.status).toBe('planned');
  for (let i = 1; i <= 3; i++) await plan.getByLabel(`Criterion ${i} done`, { exact: true }).check();
  await plan.getByLabel('Outcome notes').fill('Built the image, started the demo, and checked its parser endpoint with test data.');
  await plan.getByLabel('Evidence URL').fill('https://example.invalid/parser-demo');
  await plan.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(plan.getByRole('button', { name: 'Save plan', exact: true })).toBeDisabled();
  await expect(plan.getByText('Listed without an example', { exact: true })).toBeVisible();
  expect(api.version()!.projects[0]!.description).toBe(original); expect(api.calls()).toBe(1);
  await page.getByRole('button', { name: 'All job versions' }).click();
  await page.getByRole('button', { name: 'Open Frontend developer · Example' }).click();
  await expect(plan.getByLabel('Outcome notes')).toHaveValue(/Built the image/);
  await plan.getByRole('button', { name: 'Edit resume evidence' }).click();
  await expect(page.getByLabel('What you built and your contribution')).toBeFocused();
  await page.getByLabel('What you built and your contribution').fill(original + '\nPackaged the parser demo with Docker and checked its startup.');
  await expect(plan.getByRole('button', { name: 'Reassess saved resume' })).toBeDisabled();
  await page.getByRole('button', { name: 'Save changes', exact: true }).first().click();
  await expect(plan.getByText(/Out of date/)).toBeVisible();
  await plan.getByRole('button', { name: 'Reassess saved resume' }).click();
  await expect(plan.getByText('Mentioned in work', { exact: true })).toBeVisible();
  await expect(plan.getByLabel('Task status')).toHaveValue('completed');
  await expect(plan.getByText(/Task completion does not add evidence/)).toBeVisible();
  expect(api.calls()).toBe(1); expect(api.base.projects[0]!.description).toBe(original);
  await plan.screenshot({ path: `test-results/gap-plan-${info.project.name}.png` });
  const width = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
});

test('stale plan errors preserve notes and navigation warns about unsaved plan edits', async ({ page }) => {
  const { api, plan } = await dockerPlan(page);
  await plan.getByLabel('Outcome notes').fill('Keep these unsaved notes.');
  api.conflict(); await plan.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Reload before saving');
  await expect(plan.getByLabel('Outcome notes')).toHaveValue('Keep these unsaved notes.');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'All job versions' }).click();
  await expect(plan.getByLabel('Outcome notes')).toHaveValue('Keep these unsaved notes.');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Reload saved plans' }).click();
  await expect(plan.getByLabel('Outcome notes')).toHaveValue('Keep these unsaved notes.');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reload saved plans' }).click();
  await expect(plan.getByLabel('Outcome notes')).toHaveValue('');
  await plan.getByLabel('Task status').selectOption('in_progress');
  await page.getByLabel('Summary').fill('An unsaved resume change.');
  await plan.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(plan.getByRole('button', { name: 'Save plan', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Summary')).toHaveValue('An unsaved resume change.');
  await expect(page.getByRole('button', { name: 'Preview saved PDF', exact: true })).toBeDisabled();
  page.once('dialog', dialog => dialog.accept()); await plan.getByRole('button', { name: 'Delete plan', exact: true }).click();
  await expect(plan).toHaveCount(0); expect(api.version()!.gapPlans).toHaveLength(0);
});

test('discarding resume edits preserves plans and saving warns before discarding plan drafts', async ({ page }) => {
  const { api, plan } = await dockerPlan(page);
  await plan.getByLabel('Outcome notes').fill('My saved task outcome.');
  await plan.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(plan.getByRole('button', { name: 'Save plan', exact: true })).toBeDisabled();
  await plan.getByLabel('Outcome notes').fill('An unsaved plan draft.');
  await page.getByLabel('Summary').fill('A temporary resume draft.');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Discard edits', exact: true }).click();
  await expect(page.getByLabel('Summary')).toHaveValue('');
  await expect(plan.getByLabel('Outcome notes')).toHaveValue('An unsaved plan draft.');
  await page.getByLabel('Summary').fill('A truthful saved summary.');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Save changes', exact: true }).first().click();
  await expect(plan.getByLabel('Outcome notes')).toHaveValue('An unsaved plan draft.');
  expect(api.version()!.revision).toBe(0);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Save changes', exact: true }).first().click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await expect(plan.getByLabel('Outcome notes')).toHaveValue('My saved task outcome.');
  await expect(page.getByLabel('Summary')).toHaveValue('A truthful saved summary.');
  expect(api.version()!.gapPlans![0]!.notes).toBe('My saved task outcome.');
});
