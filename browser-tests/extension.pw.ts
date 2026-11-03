import { test, expect } from '@playwright/test';
import { openRuntime } from './runtime';

const storage = '(globalThis.browser ?? globalThis.chrome).storage.sync';
const ready = 'document.documentElement.hasAttribute("data-clean-youtube-hidemembership")';

test('Music Premium mealbars use the native dismiss button and respect the upsell setting', async ({ browserName }) => {
  const runtime = await openRuntime(browserName, `<!doctype html><html><head><style>
    ytmusic-popup-container { visibility: hidden; }
    ytmusic-mealbar-promo-renderer { visibility: visible; }
  </style></head><body>
    <ytmusic-popup-container>
      <ytmusic-mealbar-promo-renderer dialog="true" tabindex="-1">
        <h2 class="title"></h2>
        <div class="body">
          <yt-img-shadow class="icon" hidden><img alt="" width="40"></yt-img-shadow>
          <div class="messages"><yt-formatted-string>Abonnez-vous à Music&nbsp;Premium pour écouter de la musique sans pub et hors connexion, même avec l'écran éteint</yt-formatted-string></div>
        </div>
        <div class="button-wrapper">
          <yt-button-renderer class="dismiss-button" dialog-dismiss>
            <yt-button-shape><button aria-label="Non, merci"><span role="text">Non, merci</span></button></yt-button-shape>
          </yt-button-renderer>
          <yt-button-renderer class="action-button" dialog-confirm>
            <yt-button-shape><button aria-label="S’abonner"><span role="text">S’abonner</span></button></yt-button-shape>
          </yt-button-renderer>
        </div>
      </ytmusic-mealbar-promo-renderer>
      <tp-yt-paper-dialog id="playlist" opened>Playlist</tp-yt-paper-dialog>
    </ytmusic-popup-container>
    <tp-yt-iron-overlay-backdrop class="opened"></tp-yt-iron-overlay-backdrop>
    <script>
      document.documentElement.style.overflow = 'hidden';
      document.querySelector('.dismiss-button button').addEventListener('click', () => {
        document.querySelector('ytmusic-mealbar-promo-renderer').remove();
      });
      document.querySelector('.action-button button').addEventListener('click', () => {
        document.body.dataset.subscribed = 'true';
      });
    </script></body></html>`);
  try {
    const popup = await runtime.newPage();
    await popup.navigate(runtime.popupUrl);
    await expect.poll(() => popup.evaluate('document.querySelectorAll("[role=switch]:not(:disabled)").length')).toBe(6);
    await popup.evaluate(`${storage}.set({ 'settings:blockUpsell': false })`);
    const page = await runtime.newPage();
    await page.navigate('https://music.youtube.com/__clean_youtube_test__');
    await expect.poll(() => page.evaluate(ready)).toBe(true);
    await expect.poll(() => page.evaluate('document.documentElement.hasAttribute("data-clean-youtube-blockupsell")')).toBe(false);
    expect(await page.evaluate('!!document.querySelector("ytmusic-mealbar-promo-renderer")')).toBe(true);
    await popup.evaluate(`${storage}.set({ 'settings:blockUpsell': true })`);
    await expect.poll(() => page.evaluate('!!document.querySelector("ytmusic-mealbar-promo-renderer")')).toBe(false);
    expect(await page.evaluate('({ subscribed: document.body.hasAttribute("data-subscribed"), playlist: document.querySelector("#playlist").hasAttribute("opened"), backdrop: !!document.querySelector("tp-yt-iron-overlay-backdrop.opened"), overflow: document.documentElement.style.overflow })')).toEqual({ subscribed: false, playlist: true, backdrop: true, overflow: 'hidden' });
  } finally { await runtime.close(); }
});

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
    // Temporary installs inject only on navigation; reload before testing SPA changes.
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
