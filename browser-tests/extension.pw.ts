import { test, expect } from '@playwright/test';
import { openRuntime } from './runtime';

const storage = '(globalThis.browser ?? globalThis.chrome).storage.sync';
const ready = 'document.documentElement.hasAttribute("data-clean-youtube-hidemembership")';

test('installed extension uses real sync storage, handles navigation and releases page modal state', async ({ browserName }) => {
  const runtime = await openRuntime(browserName);
  try {
    const popup = await runtime.newPage();
    await popup.navigate(runtime.popupUrl);
    await expect.poll(() => popup.evaluate('document.querySelectorAll("[role=switch]:not(:disabled)").length')).toBe(6);
    await popup.evaluate(`${storage}.set({ 'settings:hidePremiumEntry': false })`);
    await expect.poll(() => popup.evaluate('Array.from(document.querySelectorAll("[role=switch]")).at(-1).getAttribute("aria-checked")')).toBe('false');
    await popup.reload();
    await expect.poll(() => popup.evaluate('Array.from(document.querySelectorAll("[role=switch]")).at(-1).getAttribute("aria-checked")')).toBe('false');

    const page = await runtime.newPage();
    await page.navigate('https://www.youtube.com/__clean_youtube_test__');
    await expect.poll(() => page.evaluate(ready)).toBe(true);
    expect(await page.evaluate('getComputedStyle(document.querySelector("#premium")).display')).not.toBe('none');
    await popup.evaluate(`${storage}.set({ 'settings:hidePremiumEntry': true })`);
    await expect.poll(() => page.evaluate('getComputedStyle(document.querySelector("#premium")).display')).toBe('none');
    await page.evaluate('document.documentElement.style.overflow = "hidden"; document.querySelector("#offer").setAttribute("opened", "")');
    await expect.poll(() => page.evaluate('document.querySelector("#offer").hasAttribute("opened")')).toBe(false);
    expect(await page.evaluate('({ playlist: document.querySelector("#playlist").hasAttribute("opened"), backdrop: !!document.querySelector("tp-yt-iron-overlay-backdrop.opened"), overflow: document.documentElement.style.overflow, focus: document.activeElement.id })')).toEqual({ playlist: true, backdrop: true, overflow: 'hidden', focus: 'trigger' });
    await page.evaluate('history.pushState({}, "", "/feed/library"); document.querySelector("#premium a").setAttribute("href", "/feed/library")');
    await expect.poll(() => page.evaluate('document.querySelector("#premium").hasAttribute("data-clean-youtube-hidden")')).toBe(false);
    await page.reload();
    await expect.poll(() => page.evaluate(ready)).toBe(true);
    await page.navigate('https://music.youtube.com/__clean_youtube_test__');
    await expect.poll(() => page.evaluate(ready)).toBe(true);
    // A leftover overlay without the active player marker must not alter Music.
    expect(await page.evaluate('({muted: document.querySelector("video").muted, time: document.querySelector("video").currentTime})')).toEqual({ muted: false, time: 0 });
  } finally { await runtime.close(); }
});

test('uninstall releases feature styles and reinstall restores working content scripts', async ({ browserName }) => {
  const runtime = await openRuntime(browserName);
  try {
    const page = await runtime.newPage();
    await page.navigate('https://www.youtube.com/__clean_youtube_test__');
    await expect.poll(() => page.evaluate('getComputedStyle(document.querySelector("#premium")).display')).toBe('none');
    // Teardown must still run on idle pages without a player poll.
    await page.evaluate('document.querySelector("#movie_player").remove()');
    await runtime.uninstall();
    await expect.poll(() => page.evaluate('getComputedStyle(document.querySelector("#premium")).display')).not.toBe('none');
    await runtime.install();
    // Temporary installation only injects into subsequent navigations. Reload
    // first, then exercise SPA mutations against the new context.
    await page.reload();
    await expect.poll(() => page.evaluate(ready)).toBe(true);
    await page.evaluate('document.querySelector("#premium a").setAttribute("href", "/feed/library")');
    await expect.poll(() => page.evaluate('document.querySelector("#premium").hasAttribute("data-clean-youtube-hidden")')).toBe(false);
  } finally { await runtime.close(); }
});

test('all native feature rules follow popup edits through real sync storage', async ({ browserName }) => {
  const runtime = await openRuntime(browserName);
  try {
    const page = await runtime.newPage();
    await page.navigate('https://www.youtube.com/__clean_youtube_test__');
    const popup = await runtime.newPage();
    await popup.navigate(runtime.popupUrl);
    await expect.poll(() => popup.evaluate('document.querySelectorAll("[role=switch]:not(:disabled)").length')).toBe(6);
    const features = [
      ['blockAds', 'ads'], ['hideShorts', 'shorts'], ['hidePlayables', 'playables'],
      ['hideMembership', 'membership'], ['blockUpsell', 'upsell'], ['hidePremiumEntry', 'premium'],
    ];
    for (const [index, [key, element]] of features.entries()) {
      const display = `getComputedStyle(document.querySelector("#${element}")).display`;
      await expect.poll(() => page.evaluate(display)).toBe('none');
      await popup.evaluate(`document.querySelectorAll('[role=switch]')[${index}].click()`);
      await expect.poll(() => popup.evaluate(`${storage}.get('settings:${key}')`)).toEqual({ [`settings:${key}`]: false });
      await expect.poll(() => page.evaluate(display)).not.toBe('none');
    }
  } finally { await runtime.close(); }
});
