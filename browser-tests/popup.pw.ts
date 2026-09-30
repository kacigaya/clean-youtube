import { test, expect } from '@playwright/test';

type Changes = Record<string, { newValue: unknown; oldValue: unknown }>;
interface TestStorage {
  values: Record<string, unknown>;
  listeners: Set<(changes: Changes) => void>;
  failRead: boolean;
  failWrite: boolean;
  change: (values: Record<string, unknown>) => void;
}
declare global { interface Window { testStorage: TestStorage } }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state: TestStorage = {
      values: { settings: { blockAds: true, hideShorts: true } },
      listeners: new Set(),
      failRead: new URL(location.href).searchParams.has('readfail'),
      failWrite: false,
      change(values) {
        const changes: Changes = {};
        for (const [key, newValue] of Object.entries(values)) {
          changes[key] = { oldValue: state.values[key], newValue };
          state.values[key] = newValue;
        }
        for (const listener of state.listeners) listener(changes);
      },
    };
    Object.assign(window, {
      testStorage: state,
      chrome: {
        runtime: { id: 'test-extension' },
        storage: { sync: {
          async get() {
            if (state.failRead) throw new Error('read failed');
            return structuredClone(state.values);
          },
          async set(values: Record<string, unknown>) {
            if (state.failWrite) throw new Error('write failed');
            state.change(values);
          },
          onChanged: {
            addListener: (listener: (changes: Changes) => void) => state.listeners.add(listener),
            removeListener: (listener: (changes: Changes) => void) => state.listeners.delete(listener),
          },
        } },
      },
    });
  });
});

test('synced changes are reflected and editing another toggle preserves them', async ({ page }) => {
  await page.goto('/');
  const ads = page.getByRole('switch', { name: /^Block ads/ });
  const shorts = page.getByRole('switch', { name: /^Hide Shorts/ });
  await expect(ads).toBeEnabled();
  await page.evaluate(() => window.testStorage.change({ 'settings:blockAds': false }));
  await expect(ads).not.toBeChecked();
  await shorts.click();
  await expect(shorts).not.toBeChecked();
  expect(await page.evaluate(() => window.testStorage.values['settings:blockAds'])).toBe(false);
  expect(await page.evaluate(() => window.testStorage.values['settings:hideShorts'])).toBe(false);
  expect(await page.evaluate(() => window.testStorage.values.settings)).toEqual({ blockAds: true, hideShorts: true });
});

test('a failed read is announced and Retry restores working controls', async ({ page }) => {
  await page.goto('/?readfail');
  await expect(page.getByRole('alert')).toHaveText('Could not load settings. Try again.');
  const ads = page.getByRole('switch', { name: /^Block ads/ });
  await expect(ads).toBeDisabled();
  await page.evaluate(() => { window.testStorage.failRead = false; });
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(ads).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.testStorage.listeners.size)).toBe(7);
});

test('failed saves leave the confirmed setting intact and allow retrying the toggle', async ({ page }) => {
  await page.goto('/');
  const ads = page.getByRole('switch', { name: /^Block ads/ });
  await expect(ads).toBeEnabled();
  await page.evaluate(() => { window.testStorage.failWrite = true; });
  await ads.click();
  await expect(page.getByRole('alert')).toHaveText('Could not save this setting. Try again.');
  await expect(ads).toBeChecked();
  await page.evaluate(() => { window.testStorage.failWrite = false; });
  await ads.click();
  await expect(ads).not.toBeChecked();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('switches remain keyboard accessible', async ({ page }) => {
  await page.goto('/');
  const ads = page.getByRole('switch', { name: /^Block ads/ });
  await expect(ads).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(ads).toBeFocused();
  await page.keyboard.press('Space');
  await expect(ads).not.toBeChecked();
});
