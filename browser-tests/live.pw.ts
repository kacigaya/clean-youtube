import { test, expect } from '@playwright/test';
import { openRuntime } from './runtime';

for (const hostname of ['www.youtube.com', 'music.youtube.com']) {
  test(`live installed extension on ${hostname}`, async ({ browserName }) => {
    test.skip(process.env.LIVE_YOUTUBE !== '1', 'Opt-in network smoke test; deterministic CI uses intercepted fixtures.');
    test.setTimeout(60000);
    const runtime = await openRuntime(browserName, undefined, true);
    let diagnostics: (() => Promise<unknown>) | undefined;
    try {
      const popup = await runtime.newPage();
      await popup.navigate(runtime.popupUrl);
      await expect.poll(() => popup.evaluate('document.querySelectorAll("[role=switch]:not(:disabled)").length')).toBe(6);
      await popup.evaluate('(globalThis.browser ?? globalThis.chrome).storage.sync.set({"settings:hidePremiumEntry":false})');
      const page = await runtime.newPage();
      diagnostics = () => page.evaluate('({url:location.href,title:document.title,text:document.body?.innerText.slice(0,500)})');
      await page.navigate(`https://${hostname}/`);
      if (await page.evaluate('location.hostname') === 'consent.youtube.com') {
        // Only reject optional cookies in this disposable anonymous profile.
        await page.evaluate(`(() => {
          const reject = Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Reject all');
          if (!reject) throw new Error('Consent page has no Reject all control');
          reject.click();
        })()`);
      }
      await expect.poll(() => page.evaluate('!!document.querySelector("ytd-app, ytmusic-app")').catch((error: unknown) => {
        if (error instanceof Error && error.message.includes('Execution context was destroyed')) return false;
        throw error;
      }), { timeout: 25000 }).toBe(true);
      await expect.poll(() => page.evaluate('document.documentElement.hasAttribute("data-clean-youtube-hidepremiumentry")')).toBe(false);
      await popup.evaluate('(globalThis.browser ?? globalThis.chrome).storage.sync.set({"settings:hidePremiumEntry":true})');
      await expect.poll(() => page.evaluate('document.documentElement.hasAttribute("data-clean-youtube-hidepremiumentry")')).toBe(true);
      const audit = await page.evaluate(`({
        url: location.href,
        title: document.title,
        guideEntries: document.querySelectorAll('ytd-guide-entry-renderer, ytmusic-guide-entry-renderer').length,
        markedPremiumEntries: document.querySelectorAll('[data-clean-youtube-hidden]').length,
        visibleMarkedEntries: Array.from(document.querySelectorAll('[data-clean-youtube-hidden]')).filter(entry => getComputedStyle(entry).display !== 'none').length
      })`);
      console.log(JSON.stringify({ browserName, hostname, audit }));
      expect(audit).toMatchObject({ visibleMarkedEntries: 0 });
      await page.reload();
      await expect.poll(() => page.evaluate('document.documentElement.hasAttribute("data-clean-youtube-hidepremiumentry")')).toBe(true);
    } catch (error) {
      // Preserve diagnostics for consent, region and network failures without
      // silently accepting a page that never rendered the application.
      console.error(JSON.stringify({ browserName, hostname, diagnostic: await diagnostics?.().catch(() => 'unavailable') }));
      throw error;
    } finally { await runtime.close(); }
  });
}
