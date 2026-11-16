import { test, expect, type Page } from '@playwright/test';

const initial = () => ({ profileId: '507f1f77bcf86cd799439011', revision: 0,
  personalInfo: { fullName: 'Synthetic Candidate', summary: 'Built a parser.' },
  experiences: [], education: [], projects: [], skills: ['TypeScript'] });

async function workspace(page: Page, empty = false) {
  let saved: ReturnType<typeof initial> | null = empty ? null : initial();
  let conflict = false;
  let fail = false;
  let saves = 0;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (!path.startsWith('/api/')) return route.continue();
    const respond = (data: unknown, status = 200) => route.fulfill({ status, json: { success: status < 400, data } });
    if (path.startsWith('/api/auth/')) return respond({ token: 'synthetic-session-token' });
    expect(request.headers().authorization).toBe('Bearer synthetic-session-token');
    if (path.endsWith('/me')) return respond(saved);
    if (request.method() === 'DELETE') { saved = null; return route.fulfill({ status: 204 }); }
    if (request.method() === 'POST' && path === '/api/profile') {
      saved = { ...initial(), ...request.postDataJSON(), revision: 0 }; return respond(saved, 201);
    }
    if (request.method() === 'PUT') {
      saves++;
      if (conflict || fail) return route.fulfill({ status: conflict ? 409 : 400, json: { success: false, error: conflict ? 'Your resume changed in another session. Your edits are still here.' : 'Enter a valid project URL.' } });
      const body = request.postDataJSON(); expect(body.revision).toBe(saved?.revision);
      saved = { profileId: initial().profileId, revision: body.revision + 1, ...body.content }; return respond(saved);
    }
    if (path.endsWith('/export')) {
      expect(url.searchParams.get('revision')).toBe(String(saved?.revision));
      return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\nsynthetic download fixture' });
    }
    throw new Error(`Unexpected API request: ${request.method()} ${path}`);
  });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  return { saved: () => saved, setConflict: () => { conflict = true; }, setFail: () => { fail = true; }, saves: () => saves };
}

test('manual creation, corrections, save, same-file preview/download and relogin', async ({ page }, info) => {
  const api = await workspace(page, true);
  await page.getByLabel('Full name', { exact: true }).fill('Synthetic Candidate');
  await page.getByRole('button', { name: 'Start a blank resume' }).click();
  await expect(page.getByRole('heading', { name: 'A resume that sounds like you.' })).toBeVisible();
  await page.getByLabel('Summary', { exact: true }).fill('Built and tested a small parser.');
  await page.getByRole('button', { name: '+ Add project', exact: true }).click();
  await page.getByLabel('Project name').fill('Parser Portfolio');
  await page.getByLabel('Technologies').fill('TypeScript\nNode.js');
  await page.getByLabel('What you built and your contribution').fill('Wrote a parser and regression tests.');
  await expect(page.getByRole('button', { name: 'Preview saved PDF' })).toBeDisabled();
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save changes', exact: true }).first().click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  expect(api.saved()?.projects).toHaveLength(1);
  expect(api.saved()?.personalInfo.summary).toBe('Built and tested a small parser.');
  await page.screenshot({ path: `test-results/editor-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Preview saved PDF' }).click();
  const preview = page.getByTitle('Saved resume PDF');
  await expect(preview).toBeVisible();
  const link = page.getByRole('link', { name: 'Download this PDF' });
  await expect(link).toHaveAttribute('href', (await preview.getAttribute('src'))!);
  const downloadPromise = page.waitForEvent('download');
  await link.click();
  expect((await downloadPromise).suggestedFilename()).toBe('resume.pdf');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Summary', { exact: true })).toHaveValue('Built and tested a small parser.');
  const size = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
  expect(size.document).toBeLessThanOrEqual(size.width);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('server errors retain edits; stale saves require explicit reload', async ({ page }) => {
  const api = await workspace(page);
  await page.getByLabel('Summary', { exact: true }).fill('Unsaved correction.');
  api.setConflict();
  await page.getByRole('button', { name: 'Save changes', exact: true }).first().click();
  await expect(page.getByRole('alert')).toContainText('Your edits are still here');
  await expect(page.getByLabel('Summary', { exact: true })).toHaveValue('Unsaved correction.');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true }).first()).toBeDisabled();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Reload saved resume' }).click();
  await expect(page.getByLabel('Summary', { exact: true })).toHaveValue('Unsaved correction.');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Reload saved resume' }).click();
  await expect(page.getByLabel('Summary', { exact: true })).toHaveValue('Built a parser.');
  expect(api.saves()).toBe(1);
});

test('failed save preserves draft, discard restores saved fields, delete clears workspace', async ({ page }) => {
  const api = await workspace(page); api.setFail();
  await page.getByLabel('Summary', { exact: true }).fill('My unsaved edit.');
  await page.getByRole('button', { name: 'Save changes', exact: true }).first().click();
  await expect(page.getByRole('alert')).toHaveText('Enter a valid project URL.');
  await expect(page.getByLabel('Summary', { exact: true })).toHaveValue('My unsaved edit.');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Discard edits' }).click();
  await expect(page.getByLabel('Summary', { exact: true })).toHaveValue('Built a parser.');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete saved resume' }).click();
  await expect(page.getByRole('button', { name: 'Import PDF', exact: true })).toBeVisible();
});
