import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

async function contentWorld(page: Page) {
  const session = await page.context().newCDPSession(page);
  const { frameTree } = await session.send('Page.getFrameTree');
  const { executionContextId } = await session.send('Page.createIsolatedWorld', {
    frameId: frameTree.frame.id,
    worldName: 'clean-youtube-test',
  });
  const source = await readFile('.output/test-fixture/fixture.js', 'utf8');
  await session.send('Runtime.evaluate', { expression: source, contextId: executionContextId });
  return async (expression: string): Promise<unknown> => {
    const response = await session.send('Runtime.evaluate', {
      expression,
      contextId: executionContextId,
      returnByValue: true,
    });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  };
}

test('native Premium dismissal crosses the isolated-world boundary and preserves another modal', async ({ page }) => {
  await page.setContent('<ytd-popup-container><tp-yt-paper-dialog id="premium" opened><a href="/premium">Offer</a><button dialog-dismiss>Close</button></tp-yt-paper-dialog><tp-yt-paper-dialog id="playlist" opened>Playlist</tp-yt-paper-dialog></ytd-popup-container><tp-yt-iron-overlay-backdrop class="opened"></tp-yt-iron-overlay-backdrop>');
  await page.evaluate(() => {
    document.documentElement.style.overflow = 'hidden';
    const dialog = document.querySelector('#premium')!;
    Object.assign(dialog, { close: () => { throw new Error('Page method must not be called'); } });
    document.querySelector('button')!.addEventListener('click', () => dialog.removeAttribute('opened'));
  });
  const evaluate = await contentWorld(page);
  expect(await evaluate('typeof document.querySelector("#premium").close')).toBe('undefined');
  expect(await evaluate('window.youtube.dismissUpsells()')).toBe(true);
  await expect(page.locator('#premium')).not.toHaveAttribute('opened');
  await expect(page.locator('#playlist')).toHaveAttribute('opened');
  await expect(page.locator('tp-yt-iron-overlay-backdrop')).toHaveClass('opened');
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
});

test('CSS leaves an undismissable membership modal visible and ignores Premium-like URLs', async ({ page }) => {
  await page.setContent('<ytd-popup-container><tp-yt-paper-dialog opened><a href="/channel/abc/join">Join</a></tp-yt-paper-dialog></ytd-popup-container><ytd-guide-entry-renderer id="channel"><a href="/@premium_news">Channel</a></ytd-guide-entry-renderer><ytd-guide-entry-renderer id="premium"><a href="/premium?source=guide">Premium</a></ytd-guide-entry-renderer>');
  const evaluate = await contentWorld(page);
  await evaluate('(() => { const style = document.createElement("style"); style.textContent = window.youtube.CSS.hideMembership + window.youtube.CSS.hidePremiumEntry; document.head.append(style); })()');
  await expect(page.locator('tp-yt-paper-dialog')).toBeVisible();
  await expect(page.locator('#channel')).toBeVisible();
  await expect(page.locator('#premium')).toBeHidden();
  expect(await evaluate('window.youtube.dismissMembershipDialogs()')).toBe(false);
});

test('a hidden ad overlay cannot affect real media playback state', async ({ page }) => {
  await page.setContent('<div id="movie_player"><video class="html5-main-video"></video><div class="ytp-ad-player-overlay" hidden></div></div>');
  const evaluate = await contentWorld(page);
  expect(await evaluate('window.youtube.skipPlayerAd(document, true)')).toBe(false);
  expect(await page.evaluate(() => ({ muted: document.querySelector('video')!.muted, time: document.querySelector('video')!.currentTime }))).toEqual({ muted: false, time: 0 });
});

test('modal mealbars remain visible without a native dismiss control', async ({ page }) => {
  await page.setContent('<ytmusic-popup-container><tp-yt-paper-dialog opened><ytmusic-mealbar-promo-renderer id="nested">Offer</ytmusic-mealbar-promo-renderer></tp-yt-paper-dialog></ytmusic-popup-container><ytmusic-mealbar-promo-renderer id="dialog" dialog>Offer</ytmusic-mealbar-promo-renderer><ytmusic-mealbar-promo-renderer id="banner">Offer</ytmusic-mealbar-promo-renderer>');
  const evaluate = await contentWorld(page);
  await evaluate('(() => { const style = document.createElement("style"); style.textContent = window.youtube.CSS.blockUpsell; document.head.append(style); })()');
  expect(await evaluate('window.youtube.dismissUpsells()')).toBe(false);
  await expect(page.locator('#nested')).toBeVisible();
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('#banner')).toBeHidden();
});
