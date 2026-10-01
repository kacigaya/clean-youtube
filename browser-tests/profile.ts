import { chromium } from '@playwright/test';
import { resolve } from 'node:path';

// Synthetic long feed; timing is evidence for local changes, never a CI gate.
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'],
});
try {
  const browser = context.browser();
  if (!browser) throw new Error('Missing Chromium browser');
  const browserSession = await browser.newBrowserCDPSession();
  const { id } = await browserSession.send('Extensions.loadUnpacked', { path: resolve('.output/chrome-mv3') });
  const feed = '<ytd-rich-item-renderer><ytd-button-renderer><a href="/watch?v=ordinary">Watch</a></ytd-button-renderer></ytd-rich-item-renderer>'.repeat(5000);
  await context.route('https://www.youtube.com/**', (route) => route.fulfill({ contentType: 'text/html', body: `<html><head></head><body><main>${feed}</main><div id="status"></div></body></html>` }));
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  const worlds: { id: number; origin: string; name: string }[] = [];
  session.on('Runtime.executionContextCreated', ({ context }) => worlds.push(context));
  await session.send('Runtime.enable');
  await page.goto('https://www.youtube.com/__clean_youtube_profile__');
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-clean-youtube-hidemembership'));
  const world = worlds.find((world) => world.origin === `chrome-extension://${id}` || world.name === id);
  if (!world) throw new Error('Extension content world not found: ' + JSON.stringify(worlds));
  await session.send('Runtime.evaluate', { contextId: world.id, expression: `
    globalThis.profile = { sweeps: [], playerPollQueries: 0, playerPresenceChecks: 0 };
    const originalFrame = requestAnimationFrame;
    globalThis.requestAnimationFrame = callback => originalFrame(time => {
      const start = performance.now(); callback(time); profile.sweeps.push(performance.now() - start);
    });
    const originalQuery = Document.prototype.querySelector;
    Document.prototype.querySelector = function(selector) {
      if (selector.includes('#movie_player')) profile.playerPollQueries++;
      return originalQuery.call(this, selector);
    };
    const originalGetById = Document.prototype.getElementById;
    Document.prototype.getElementById = function(id) {
      if (id === 'movie_player' || id === 'player') profile.playerPresenceChecks++;
      return originalGetById.call(this, id);
    };
  ` });
  // Two foreground frames per change allow the observer's scheduled sweep to run.
  for (let i = 0; i < 20; i++) {
    await page.evaluate(async (iteration) => {
      document.querySelector('#status')!.textContent = String(iteration);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, i);
  }
  const result = await session.send('Runtime.evaluate', { contextId: world.id, returnByValue: true, expression: 'profile' });
  console.log(JSON.stringify({ browser: await browser.version(), cards: 5000, unrelatedMutations: 20, ...result.result.value }, null, 2));
} finally { await context.close(); }
