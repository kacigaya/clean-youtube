import { beforeEach, describe, expect, test } from 'bun:test';
import {
  CSS,
  buildCss,
  dismissUpsells,
  hidePremiumGuideEntries,
  installAbnormalityBypass,
  installPlayerAdBlocker,
  prunePlayerAds,
  skipPlayerAd,
} from '@/lib/youtube';

const PREMIUM_ICON =
  'M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11 11-4.925 11-11S18.075 1 12 1Zm0 2a9 9 0 110 18.001A9 9 0 0112 3Z';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('buildCss', () => {
  test('only includes rules for enabled features', () => {
    const css = buildCss({
      hidePremiumEntry: true,
      hideShorts: false,
      blockUpsell: false,
      blockAds: false,
    });
    expect(css).toContain('ytmusic-guide-entry-renderer');
    expect(css).toContain('ytd-guide-entry-renderer');
    expect(css).not.toContain('ytd-reel-shelf-renderer');
    expect(css).not.toContain('ytmusic-mealbar-promo-renderer');
    expect(css).not.toContain('ytmusic-ad-slot-renderer');
  });

  test('includes YouTube ad and Shorts discovery selectors', () => {
    const css = buildCss({
      hidePremiumEntry: false,
      hideShorts: true,
      blockUpsell: false,
      blockAds: true,
    });
    expect(css).toContain('ytd-ad-slot-renderer');
    expect(css).toContain('ytd-rich-item-renderer:has(ytd-ad-slot-renderer)');
    expect(css).toContain('ytd-reel-shelf-renderer');
    expect(css).toContain('a[href^="/shorts/"]');
    expect(css).not.toContain('ytmusic-statement-banner-renderer');
  });

  test('is empty when everything is off', () => {
    expect(
      buildCss({
        hidePremiumEntry: false,
        hideShorts: false,
        blockUpsell: false,
        blockAds: false,
      }).trim(),
    ).toBe('');
  });

  test('Premium banner rule requires a Premium link', () => {
    expect(CSS.blockUpsell).toContain(
      'ytd-statement-banner-renderer:has(a[href*="premium" i]',
    );
    expect(CSS.blockUpsell).not.toMatch(/ytd-statement-banner-renderer,|ytd-statement-banner-renderer\s*\{/);
  });
});

describe('player ad metadata blocking', () => {
  test('removes only direct and nested player ad metadata', () => {
    const response = {
      adPlacements: [{}],
      playerAds: [{}],
      adSlots: [{}],
      important: true,
      playerResponse: { adPlacements: [{}], videoDetails: { videoId: 'song' } },
      contents: { title: 'Song' },
    };

    const pruned = prunePlayerAds(response);
    expect(pruned).toBe(response);
    expect(pruned).toEqual({
      important: true,
      playerResponse: { videoDetails: { videoId: 'song' } },
      contents: { title: 'Song' },
    });
  });

  test('removes the enforcement and detection payloads', () => {
    const response = {
      adBreakHeartbeatParams: 'x',
      responseContext: { adSignalsInfo: { params: [] }, visitorData: 'keep' },
      auxiliaryUi: {
        messageRenderers: { upsellDialogRenderer: {}, otherRenderer: { keep: true } },
      },
      playerResponse: { adBreakHeartbeatParams: 'x', streamingData: { formats: [] } },
    };

    expect(prunePlayerAds(response)).toEqual({
      responseContext: { visitorData: 'keep' },
      auxiliaryUi: { messageRenderers: { otherRenderer: { keep: true } } },
      playerResponse: { streamingData: { formats: [] } },
    });
  });

  test('walks past a missing branch without creating one', () => {
    const response = { videoDetails: {} };
    expect(prunePlayerAds(response)).toEqual({ videoDetails: {} });
    expect(prunePlayerAds(null)).toBeNull();
  });

  test('neutralises the abnormality continuation only while enabled', async () => {
    class TestPromise<T> extends Promise<T> {}
    let enabled = true;
    installAbnormalityBypass({ Promise: TestPromise as unknown as PromiseConstructor }, () => enabled);

    const calls = { onAbnormalityDetected: 0, playback: 0 };
    const enforce = () => {
      calls.onAbnormalityDetected += 1;
    };
    const play = () => {
      calls.playback += 1;
    };

    await TestPromise.resolve(null).then(enforce);
    await TestPromise.resolve(null).then(play);
    expect(calls).toEqual({ onAbnormalityDetected: 0, playback: 1 });

    enabled = false;
    await TestPromise.resolve(null).then(enforce);
    expect(calls.onAbnormalityDetected).toBe(1);
  });

  test('prunes parsed and initial responses only while enabled', () => {
    let enabled = true;
    const root = {
      JSON: { parse: JSON.parse, stringify: JSON.stringify } as JSON,
      ytInitialPlayerResponse: undefined as unknown,
      playerResponse: undefined as unknown,
    };
    installPlayerAdBlocker(root, () => enabled);

    expect(root.JSON.parse('{"playerResponse":{"adSlots":[1],"videoDetails":{}}}')).toEqual({
      playerResponse: { videoDetails: {} },
    });
    root.ytInitialPlayerResponse = { adPlacements: [1], videoDetails: {} };
    expect(root.ytInitialPlayerResponse).toEqual({ videoDetails: {} });

    enabled = false;
    expect(root.JSON.parse('{"adSlots":[1]}')).toEqual({ adSlots: [1] });
    root.playerResponse = { playerAds: [1] };
    expect(root.playerResponse).toEqual({ playerAds: [1] });

    enabled = true;
    expect(
      root.JSON.parse('{"adSlots":[1]}', (_key, value) =>
        typeof value === 'object' && value !== null ? Object.freeze(value) : value,
      ),
    ).toEqual({ adSlots: [1] });
  });

  test('prunes fetch and XHR object responses only while enabled', async () => {
    class FakeResponse {
      constructor(private value: unknown) {}

      async json() {
        return this.value;
      }
    }

    class FakeXMLHttpRequest {
      constructor(private value: unknown) {}

      get response() {
        return this.value;
      }
    }

    let enabled = true;
    const root = {
      JSON: { parse: JSON.parse, stringify: JSON.stringify } as JSON,
      Response: FakeResponse,
      XMLHttpRequest: FakeXMLHttpRequest,
    };
    installPlayerAdBlocker(root, () => enabled);

    expect(await new root.Response({ adSlots: [1], videoDetails: {} }).json()).toEqual({
      videoDetails: {},
    });
    expect(new root.XMLHttpRequest({ playerAds: [1], videoDetails: {} }).response).toEqual({
      videoDetails: {},
    });

    enabled = false;
    expect(await new root.Response({ adSlots: [1] }).json()).toEqual({ adSlots: [1] });
    expect(new root.XMLHttpRequest({ adPlacements: [1] }).response).toEqual({
      adPlacements: [1],
    });
  });
});

describe('hidePremiumGuideEntries', () => {
  test('marks the entry linking to Premium', () => {
    document.body.innerHTML = `
      <ytmusic-guide-entry-renderer id="home"><a href="/">Home</a></ytmusic-guide-entry-renderer>
      <ytmusic-guide-entry-renderer id="premium">
        <a href="https://www.youtube.com/musicpremium">S'abonner</a>
      </ytmusic-guide-entry-renderer>`;

    hidePremiumGuideEntries();

    expect(document.querySelector<HTMLElement>('#premium')!.dataset.cleanYoutubeHidden).toBe('1');
    expect(document.querySelector<HTMLElement>('#home')!.dataset.cleanYoutubeHidden).toBeUndefined();
  });

  test('marks a localised entry by its icon when the link is missing', () => {
    document.body.innerHTML = `
      <ytmusic-guide-entry-renderer id="premium">
        <svg><path d="${PREMIUM_ICON}"></path></svg>
        <yt-formatted-string>S'abonner</yt-formatted-string>
      </ytmusic-guide-entry-renderer>`;

    hidePremiumGuideEntries();

    expect(document.querySelector<HTMLElement>('#premium')!.dataset.cleanYoutubeHidden).toBe('1');
  });

  test('marks the standard YouTube Premium entry', () => {
    document.body.innerHTML = `
      <ytd-guide-entry-renderer id="premium"><a href="/premium">Premium</a></ytd-guide-entry-renderer>`;

    hidePremiumGuideEntries();

    expect(document.querySelector<HTMLElement>('#premium')!.dataset.cleanYoutubeHidden).toBe('1');
  });

  test('leaves a playlist entry alone', () => {
    document.body.innerHTML = `
      <ytmusic-guide-entry-renderer id="lib"><a href="/library">Library</a></ytmusic-guide-entry-renderer>`;

    hidePremiumGuideEntries();

    expect(document.querySelector<HTMLElement>('#lib')!.dataset.cleanYoutubeHidden).toBeUndefined();
  });
});

describe('dismissUpsells', () => {
  test('clicks the promo dismiss button instead of removing the node', () => {
    document.body.innerHTML = `
      <ytmusic-mealbar-promo-renderer>
        <a href="/premium">Premium</a>
        <div id="dismiss-button"><button>No thanks</button></div>
      </ytmusic-mealbar-promo-renderer>`;
    let clicks = 0;
    document.querySelector('#dismiss-button button')!.addEventListener('click', () => clicks++);

    expect(dismissUpsells()).toBe(true);
    expect(clicks).toBe(1);
    expect(document.querySelector('ytmusic-mealbar-promo-renderer')).not.toBeNull();
  });

  test('leaves unrelated promo bars alone', () => {
    document.body.innerHTML = `
      <ytd-mealbar-promo-renderer>
        <a href="/about">YouTube update</a>
        <div id="dismiss-button"><button>Dismiss</button></div>
      </ytd-mealbar-promo-renderer>`;

    expect(dismissUpsells()).toBe(false);
    expect(document.querySelector('ytd-mealbar-promo-renderer')).not.toBeNull();
  });

  test('removes a Premium dialog and its leftover backdrop', () => {
    document.body.innerHTML = `
      <ytd-popup-container>
        <tp-yt-paper-dialog opened>
          <a href="https://www.youtube.com/premium">Try Premium</a>
        </tp-yt-paper-dialog>
      </ytd-popup-container>
      <tp-yt-iron-overlay-backdrop class="opened"></tp-yt-iron-overlay-backdrop>`;

    expect(dismissUpsells()).toBe(true);
    expect(document.querySelector('tp-yt-paper-dialog')).toBeNull();
    expect(document.querySelector('tp-yt-iron-overlay-backdrop')).toBeNull();
  });

  test('leaves unrelated dialogs open', () => {
    document.body.innerHTML = `
      <ytmusic-popup-container>
        <tp-yt-paper-dialog opened><a href="/playlist?list=x">Add to playlist</a></tp-yt-paper-dialog>
      </ytmusic-popup-container>`;

    expect(dismissUpsells()).toBe(false);
    expect(document.querySelector('tp-yt-paper-dialog')).not.toBeNull();
  });
});

describe('skipPlayerAd', () => {
  test('does nothing when no ad is playing', () => {
    document.body.innerHTML = '<div id="movie_player"><video></video></div>';
    expect(skipPlayerAd()).toBe(false);
  });

  test('prefers the skip button', () => {
    document.body.innerHTML = `
      <div id="movie_player" class="ad-showing">
        <button class="ytp-ad-skip-button">Skip</button>
        <video></video>
      </div>`;
    let clicks = 0;
    document.querySelector('.ytp-ad-skip-button')!.addEventListener('click', () => clicks++);

    expect(skipPlayerAd()).toBe(true);
    expect(clicks).toBe(1);
  });

  test('seeks to the end of an unskippable ad', () => {
    document.body.innerHTML = '<div id="movie_player" class="ad-showing"><video></video></div>';
    const video = document.querySelector<HTMLVideoElement>('video')!;
    Object.defineProperty(video, 'duration', { value: 12, configurable: true });

    expect(skipPlayerAd()).toBe(true);
    expect(video.currentTime).toBe(12);
  });

  test('does not seek while the ad duration is still unknown', () => {
    document.body.innerHTML = '<div id="movie_player" class="ad-showing"><video></video></div>';
    const video = document.querySelector<HTMLVideoElement>('video')!;
    Object.defineProperty(video, 'duration', { value: NaN, configurable: true });

    expect(skipPlayerAd()).toBe(false);
    expect(video.currentTime).toBe(0);
  });
});
