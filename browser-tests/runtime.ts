import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { startFirefox } from './firefox';

export const runtimeFixture = `<!doctype html><html><head><title>Extension fixture</title></head><body>
<ytd-guide-entry-renderer id="premium"><a href="/premium">Premium</a></ytd-guide-entry-renderer>
<ytd-guide-entry-renderer id="normal"><a href="/feed/library">Library</a></ytd-guide-entry-renderer>
<ytd-reel-shelf-renderer id="shorts">Shorts</ytd-reel-shelf-renderer>
<ytd-mini-game-card-view-model id="playables">Game</ytd-mini-game-card-view-model>
<ytd-button-renderer id="membership"><a href="/channel/abc/join">Join</a></ytd-button-renderer>
<ytmusic-statement-banner-renderer id="upsell"><a href="/premium">Offer</a></ytmusic-statement-banner-renderer>
<ytd-ad-slot-renderer id="ads">Ad</ytd-ad-slot-renderer>
<div id="movie_player"><video class="html5-main-video"></video><div class="ytp-ad-player-overlay" hidden></div></div>
<button id="trigger">Open offer</button><ytd-popup-container><tp-yt-paper-dialog id="offer">
<a href="/channel/abc/join">Join</a><button dialog-dismiss disabled>Unavailable</button><button id="close-button">Close</button>
</tp-yt-paper-dialog><tp-yt-paper-dialog id="playlist" opened>Playlist</tp-yt-paper-dialog></ytd-popup-container>
<tp-yt-iron-overlay-backdrop class="opened"></tp-yt-iron-overlay-backdrop>
<script>
document.querySelector('#offer').close = () => { throw new Error('Page method must not be called'); };
document.querySelector('#close-button').addEventListener('click', () => {
  document.querySelector('#offer').removeAttribute('opened');
  document.querySelector('#trigger').focus();
});
</script></body></html>`;

/** Install built extensions without changing their permissions or content-script matches. */
export async function openRuntime(browserName: string, fixture = runtimeFixture, live = false) {
  const directory = await mkdtemp(join(tmpdir(), 'clean-youtube-runtime-'));
  if (browserName === 'chromium') {
    const context = await chromium.launchPersistentContext(join(directory, 'profile'), {
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
      channel: 'chromium',
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--enable-unsafe-extension-debugging'],
    }).catch(async (error: unknown) => { await rm(directory, { recursive: true, force: true }); throw error; });
    try {
      const browser = context.browser();
      if (!browser) throw new Error('Missing Chromium browser');
      const session = await browser.newBrowserCDPSession();
      const path = resolve('.output/chrome-mv3');
      const { id } = await session.send('Extensions.loadUnpacked', { path });
      if (!live) await context.route('https://*.youtube.com/**', (route) => route.fulfill({ contentType: 'text/html', body: fixture }));
      return {
        popupUrl: `chrome-extension://${id}/popup.html`,
        async newPage() {
          const page = await context.newPage();
          return {
            navigate: (url: string) => page.goto(url, { waitUntil: 'domcontentloaded' }),
            reload: () => page.reload({ waitUntil: 'domcontentloaded' }),
            evaluate: (expression: string): Promise<unknown> => page.evaluate((source) => eval(source), expression),
          };
        },
        uninstall: () => session.send('Extensions.uninstall', { id }),
        install: () => session.send('Extensions.loadUnpacked', { path }),
        async close() { await context.close(); await rm(directory, { recursive: true, force: true }); },
      };
    } catch (error) { await context.close(); await rm(directory, { recursive: true, force: true }); throw error; }
  }
  const extensionId = 'clean-youtube-tests@local.invalid';
  const uuid = randomUUID();
  const path = join(directory, 'extension');
  await cp(resolve('.output/firefox-mv2'), path, { recursive: true });
  const manifest = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8'));
  // Temporary Firefox installs need an ID for storage.sync. Production identity
  // still belongs to AMO; this change exists only in the disposable test copy.
  manifest.browser_specific_settings.gecko.id = extensionId;
  await writeFile(join(path, 'manifest.json'), JSON.stringify(manifest));
  const browser = await startFirefox(uuid, extensionId).catch(async (error: unknown) => { await rm(directory, { recursive: true, force: true }); throw error; });
  try {
    const install = () => browser.send('webExtension.install', { extensionData: { type: 'path', path } });
    await install();
    if (!live) {
      await browser.send('session.subscribe', { events: ['network.beforeRequestSent'] });
      await browser.send('network.addIntercept', { phases: ['beforeRequestSent'], urlPatterns: ['www.youtube.com', 'music.youtube.com'].map((hostname) => ({ type: 'pattern', protocol: 'https', hostname })) });
      browser.onEvent((event) => {
        const request = event.params?.request;
        if (event.method !== 'network.beforeRequestSent' || !event.params?.isBlocked || typeof request !== 'object' || request === null || !('request' in request)) return;
        void browser.send('network.provideResponse', {
          request: request.request, statusCode: 200,
          headers: [{ name: 'Content-Type', value: { type: 'string', value: 'text/html' } }],
          body: { type: 'string', value: fixture },
        }).catch((error: unknown) => console.error('Firefox fixture response failed', error));
      });
    }
    return {
      popupUrl: `moz-extension://${uuid}/popup.html`,
      newPage: () => browser.createPage(),
      uninstall: () => browser.send('webExtension.uninstall', { extension: extensionId }),
      install,
      async close() { await browser.close(); await rm(directory, { recursive: true, force: true }); },
    };
  } catch (error) { await browser.close(); await rm(directory, { recursive: true, force: true }); throw error; }
}
