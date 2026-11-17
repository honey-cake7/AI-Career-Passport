import { test, expect, type Page } from '@playwright/test';
import type { IProfile, JobVersion, SkillNormalization } from '../src/types';

const id = '507f1f77bcf86cd799439011';
const vid = '507f1f77bcf86cd799439012';
function snapshot(skills: string[], unavailable = false): SkillNormalization {
  return { schemaVersion: 1, generatedAt: '2026-11-17T12:00:00Z', status: unavailable ? 'unavailable' : 'ready',
    entries: skills.map((raw, i) => ({ id: `skill:${i}`, raw,
      suggestion: !unavailable && ['reactjs', 'ReactJS'].includes(raw) ? 'React.js' : null,
      method: !unavailable && ['reactjs', 'ReactJS'].includes(raw) ? 'model' : 'unresolved', choice: 'pending', value: raw })) };
}
async function setup(page: Page, manual = false) {
  const skills = ['reactjs', 'ReactJS', 'Unlisted tool', 'SQL, reporting'];
  const saved: IProfile = { profileId: id, revision: 0, personalInfo: { fullName: 'Synthetic Candidate' }, experiences: [], education: [], projects: [], skills,
    ...(manual ? {} : { skillNormalization: snapshot(skills) }) };
  let version: JobVersion | null = null;
  let normalizations = 0;
  let conflict = false;
  let unavailable = false;
  let fail = false;
  let saves = 0;
  await page.route('**/api/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname;
    if (!path.startsWith('/api/')) return route.continue();
    const respond = (data: unknown, status = 200) => route.fulfill({ status, json: { success: status < 400, data } });
    if (path.startsWith('/api/auth/')) return respond({ token: 'synthetic-session' });
    expect(req.headers().authorization).toBe('Bearer synthetic-session');
    if (path.endsWith('/me')) return respond(saved);
    const root = `/api/profile/${id}/versions`;
    if (path === root) {
      if (req.method() === 'GET') return respond(version ? [version] : []);
      const body = req.postDataJSON();
      version = { ...structuredClone(saved), profileId: vid, revision: 0, label: body.label, jobDescription: body.jobDescription,
        baseRevision: saved.revision, createdAt: '2026-11-17T12:00:00Z', analysis: null, gapPlans: [], plansRevision: 0 };
      return respond(version, 201);
    }
    const target = path.includes(`/versions/${vid}`) ? version! : saved;
    if (path.endsWith('/skills/normalize')) {
      normalizations++;
      expect(req.postDataJSON()).toEqual({ revision: target.revision });
      if (conflict || fail) return route.fulfill({ status: conflict ? 409 : 503, json: { error: conflict ? 'Your resume changed. Reload before reviewing skills.' : 'Skill suggestions are unavailable. Your saved skills are unchanged.' } });
      target.skillNormalization = snapshot(target.skills, unavailable); target.revision++;
      if ('analysis' in target) target.analysis = null;
      return respond(target);
    }
    if (path.endsWith('/export')) {
      expect(url.searchParams.get('revision')).toBe(String(target.revision));
      return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\nsynthetic fixture' });
    }
    if (req.method() === 'PUT') {
      const body = req.postDataJSON(); saves++;
      expect(body.revision).toBe(target.revision);
      if (conflict) return route.fulfill({ status: 409, json: { error: 'Your resume changed. Your edits are still here.' } });
      for (const decision of body.skillReviews ?? []) {
        const entry = target.skillNormalization!.entries.find(entry => entry.id === decision.id)!;
        expect(Object.keys(decision).sort()).toEqual(decision.choice === 'custom' ? ['choice', 'id', 'value'] : ['choice', 'id']);
        entry.choice = decision.choice;
        entry.value = decision.choice === 'custom' ? decision.value : decision.choice === 'original' ? entry.raw : entry.suggestion!;
        expect(body.content.skills).toContain(entry.value);
      }
      Object.assign(target, body.content, { revision: target.revision + 1 });
      return respond(target);
    }
    if (path === `${root}/${vid}`) return respond(version);
    throw Error(`Unexpected request ${req.method()} ${path}`);
  });
  async function signIn() {
    // Logout finishes asynchronously; the resume editor also has an Email field.
    // Wait for the actual auth screen before filling credentials.
    await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
    await page.getByLabel('Email', { exact: true }).fill('synthetic@example.invalid');
    await page.getByLabel('Password', { exact: true }).fill('synthetic password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'A resume that sounds like you.', exact: true })).toBeVisible();
  }
  await page.goto('/'); await signIn();
  if (!manual) await page.locator('.skill-review-list > summary').click();
  return { saved: () => saved, version: () => version, calls: () => normalizations, saves: () => saves,
    conflict: (value: boolean) => { conflict = value; }, fail: (value: boolean) => { fail = value; },
    unavailable: () => { unavailable = true; }, signIn };
}

test('reviewed skill names preserve originals and manual additions through save, export and sign-in', async ({ page }, info) => {
  const api = await setup(page);
  const rows = page.locator('.skill-review-row');
  await expect(rows).toHaveCount(4);
  await expect(page.getByLabel('Your skills', { exact: true })).toHaveValue('reactjs\nReactJS\nUnlisted tool\nSQL, reporting');
  await rows.nth(0).getByRole('button', { name: 'Use suggested name' }).click();
  await rows.nth(1).getByRole('button', { name: 'Use suggested name' }).click();
  // Restoring one alias must keep the canonical name chosen for the other alias.
  await rows.nth(0).getByRole('button', { name: 'Keep original' }).click();
  await rows.nth(2).getByText('Use different wording', { exact: true }).click();
  await rows.nth(2).getByLabel('Your wording for Unlisted tool').fill('My specialized tool');
  await rows.nth(2).getByRole('button', { name: 'Use this wording' }).click();
  const field = page.getByLabel('Your skills', { exact: true });
  await field.fill((await field.inputValue()) + '\nManual addition');
  await expect(page.getByRole('button', { name: 'Preview saved PDF', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Refresh skill suggestions' })).toBeDisabled();
  expect(api.calls()).toBe(0);
  await page.getByRole('button', { name: 'Save changes', exact: true }).first().click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  expect(api.saved().skills).toEqual(expect.arrayContaining(['reactjs', 'React.js', 'SQL, reporting', 'My specialized tool', 'Manual addition']));
  expect(api.saved().skillNormalization!.entries[1]!.raw).toBe('ReactJS');
  expect(api.saved().skillNormalization!.entries[1]!.choice).toBe('suggested');
  await page.locator('.skill-review').screenshot({ path: `test-results/skill-review-${info.project.name}.png` });
  await page.getByRole('button', { name: 'Preview saved PDF', exact: true }).click();
  const preview = page.getByTitle('Saved resume PDF'); await expect(preview).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download this PDF' })).toHaveAttribute('href', (await preview.getAttribute('src'))!);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await api.signIn();
  await page.locator('.skill-review-list > summary').click();
  await expect(rows.nth(1)).toContainText('Your choice: React.js');
  await expect(rows.nth(2)).toContainText('Your choice: My specialized tool');
  expect(api.calls()).toBe(0); expect(api.saves()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('existing resumes request suggestions explicitly, retain outage results, and protect stale drafts', async ({ page }) => {
  const api = await setup(page, true);
  const review = page.getByRole('button', { name: 'Review saved skill names' });
  await page.getByLabel('Summary', { exact: true }).fill('My unsaved summary.'); await expect(review).toBeDisabled();
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Discard edits' }).click();
  api.fail(true); await review.click(); await expect(page.getByRole('alert')).toContainText('saved skills are unchanged');
  await expect(page.getByLabel('Your skills', { exact: true })).toHaveValue('reactjs\nReactJS\nUnlisted tool\nSQL, reporting');
  api.fail(false); api.unavailable(); await review.click();
  await expect(page.getByText(/Suggestions were unavailable. All original skills were kept/)).toBeVisible();
  await page.locator('.skill-review-list > summary').click();
  const row = page.locator('.skill-review-row').first(); await row.getByRole('button', { name: 'Keep original' }).click();
  api.conflict(true); await page.getByRole('button', { name: 'Save changes', exact: true }).first().click();
  await expect(page.getByRole('alert')).toContainText('Your edits are still here');
  await expect(row).toContainText('Your choice: reactjs');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Reload saved resume' }).click();
  await expect(row).toContainText('Your choice: reactjs');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reload saved resume' }).click();
  await expect(row).toContainText('Awaiting your review'); expect(api.calls()).toBe(2);
});

test('job versions save independent skill decisions and reopening keeps the choices', async ({ page }) => {
  const api = await setup(page);
  await page.getByRole('button', { name: 'Tailor for a job' }).click();
  await page.getByLabel('Version name').fill('Synthetic role');
  await page.getByLabel('Job description', { exact: true }).fill('React is required.');
  await page.getByRole('button', { name: 'Create job version', exact: true }).click();
  await page.locator('.skill-review-list > summary').click();
  await page.locator('.skill-review-row').first().getByRole('button', { name: 'Use suggested name' }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).first().click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  expect(api.version()!.skills).toContain('React.js'); expect(api.saved().skills).toContain('reactjs');
  expect(api.saved().skillNormalization!.entries[0]!.choice).toBe('pending');
  await page.getByRole('button', { name: 'All job versions' }).click();
  await page.getByRole('button', { name: 'Open Synthetic role' }).click();
  await expect(page.locator('.skill-review-row').first()).toContainText('Your choice: React.js');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Refresh skill suggestions' }).click();
  await expect(page.locator('.skill-review-row').first()).toContainText('Awaiting your review');
  expect(api.calls()).toBe(1); expect(api.saved().revision).toBe(0);
});
