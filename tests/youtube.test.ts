import { beforeEach, describe, expect, test } from 'bun:test';
import {
  CSS,
  buildCss,
  dismissUpsells,
  hidePremiumGuideEntries,
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
    expect(css).toContain('ytd-rich-item-renderer:has(ytd-feed-nudge-renderer)');
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

  test('mutes the ad and restores the sound state afterwards', () => {
    document.body.innerHTML = '<div id="movie_player" class="ad-showing"><video></video></div>';
    const player = document.querySelector('#movie_player')!;
    const video = document.querySelector<HTMLVideoElement>('video')!;
    Object.defineProperty(video, 'duration', { value: 5, configurable: true });

    skipPlayerAd();
    expect(video.muted).toBe(true);

    player.classList.remove('ad-showing');
    expect(skipPlayerAd()).toBe(false);
    expect(video.muted).toBe(false);
  });

  test('leaves a viewer-muted player muted after the ad', () => {
    document.body.innerHTML = '<div id="movie_player" class="ad-showing"><video></video></div>';
    const player = document.querySelector('#movie_player')!;
    const video = document.querySelector<HTMLVideoElement>('video')!;
    video.muted = true;

    skipPlayerAd();
    player.classList.remove('ad-showing');
    skipPlayerAd();

    expect(video.muted).toBe(true);
  });

  test('does not seek while the ad duration is still unknown', () => {
    document.body.innerHTML = '<div id="movie_player" class="ad-showing"><video></video></div>';
    const video = document.querySelector<HTMLVideoElement>('video')!;
    Object.defineProperty(video, 'duration', { value: NaN, configurable: true });

    expect(skipPlayerAd()).toBe(false);
    expect(video.currentTime).toBe(0);
  });
});
