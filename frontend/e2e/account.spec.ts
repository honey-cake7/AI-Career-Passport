import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page) {
  let mode = 403;
  let deleted = false;
  let calls = 0;
  await page.route('**/api/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === '/api/auth/account') {
      expect(req.headers().authorization).toBe('Bearer synthetic-account-session');
      expect(req.method()).toBe('DELETE'); expect(req.postDataJSON()).toEqual({ password: 'synthetic account password', confirmation: 'DELETE' }); calls++;
      if (mode === 204) { deleted = true; return route.fulfill({ status: 204 }); }
      if (mode === 202) return route.fulfill({ status: 202, json: { success: true, data: { status: 'pending' } } });
      return route.fulfill({ status: mode, json: { success: false, error: mode === 403 ? 'Current password is incorrect. This request did not start deletion.' : mode === 401 ? 'Session expired or invalid' : 'Unable to complete request. Please try again.' } });
    }
    if (path === '/api/auth/login') {
      if (deleted) return route.fulfill({ status: 401, json: { success: false, error: 'Invalid email or password' } });
      return route.fulfill({ json: { success: true, data: { token: 'synthetic-account-session' } } });
    }
    if (path === '/api/profile/me') return route.fulfill({ json: { success: true, data: { profileId: '507f1f77bcf86cd799439011', revision: 0, personalInfo: { fullName: 'Synthetic Candidate', summary: 'Built a parser.' }, experiences: [], education: [], projects: [], skills: [] } } });
    throw new Error(`Unexpected request: ${req.method()} ${path}`);
  });
  await page.goto('/'); await page.getByLabel('Email', { exact: true }).fill('synthetic@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic account password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Summary', { exact: true })).toBeVisible();
  return { mode: (value: number) => { mode = value; }, calls: () => calls };
}
async function confirm(page: Page) {
  await page.getByLabel('Current password', { exact: true }).fill('synthetic account password');
  await page.getByLabel('Type DELETE to confirm', { exact: true }).fill('DELETE');
  await page.getByRole('button', { name: 'Permanently delete my account', exact: true }).click();
}

test('account deletion protects unsaved edits, requires confirmation, and clears private state after success', async ({ page }, info) => {
  const api = await setup(page);
  await page.getByLabel('Summary', { exact: true }).fill('My unsaved resume edit.');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByLabel('Summary', { exact: true })).toHaveValue('My unsaved resume edit.'); expect(api.calls()).toBe(0);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Permanently delete my account', exact: true })).toBeDisabled();
  await expect(page.getByText(/You cannot undo this/)).toBeVisible();
  await page.screenshot({ path: `test-results/account-${info.project.name}.png`, fullPage: true });
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth })); expect(size.document).toBeLessThanOrEqual(size.viewport);
  await confirm(page);
  await expect(page.getByRole('alert')).toContainText('Current password is incorrect');
  await expect(page.getByLabel('Current password', { exact: true })).toHaveValue('');
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  api.mode(204); await confirm(page);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Your account and saved data have been deleted.', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic Candidate', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]); expect(api.calls()).toBe(2);
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic account password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Invalid email or password', { exact: true })).toBeVisible();
});
test('pending cleanup signs out and explains that deletion is still finishing', async ({ page }) => {
  const api = await setup(page); api.mode(202);
  await page.getByRole('button', { name: 'Account', exact: true }).click(); await confirm(page);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Account access is closed. Data deletion is pending and will retry automatically.', { exact: true })).toBeVisible();
  await expect(page.getByText('Your account and saved data have been deleted.', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Summary', { exact: true })).toHaveCount(0);
});
test('cancellation preserves the account, uncertain failures make no deletion claim, and expired sessions clear the screen', async ({ page }) => {
  const api = await setup(page);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByLabel('Current password', { exact: true }).fill('synthetic account password');
  await page.getByRole('button', { name: 'Keep my account', exact: true }).click();
  await expect(page.getByLabel('Summary', { exact: true })).toHaveValue('Built a parser.'); expect(api.calls()).toBe(0);
  await page.getByRole('button', { name: 'Account', exact: true }).click(); await expect(page.getByLabel('Current password', { exact: true })).toHaveValue('');
  for (const status of [200, 500]) {
    api.mode(status); await confirm(page);
    await expect(page.getByRole('alert')).toContainText('Deletion could not be confirmed');
    await expect(page.getByLabel('Current password', { exact: true })).toHaveValue('');
  }
  api.mode(401); await confirm(page);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Your session expired or this account is unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Control what stays here.' })).toHaveCount(0);
});
