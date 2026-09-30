import { beforeEach, describe, expect, test } from 'bun:test';
import type { Settings } from '@/lib/settings';
import {
  CSS,
  buildCss,
  dismissUpsells,
  dismissMembershipDialogs,
  clearPremiumGuideEntries,
  hideMembershipButtons,
  hidePremiumGuideEntries,
  restorePlayerMute,
  skipPlayerAd,
} from '@/lib/youtube';

const PREMIUM_ICON =
  'M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11 11-4.925 11-11S18.075 1 12 1Zm0 2a9 9 0 110 18.001A9 9 0 0112 3Z';

/**
 * Everything off but the named features, so a new setting cannot churn every
 * case. Keys come from `CSS` so the feature tests follow the available rules.
 */
function only(...enabled: (keyof Settings)[]): Settings {
  const keys = Object.keys(CSS) as (keyof Settings)[];
  return Object.fromEntries(
    keys.map((key) => [key, enabled.includes(key)]),
  ) as unknown as Settings;
}

beforeEach(() => {
  restorePlayerMute();
  document.body.innerHTML = '';
  document.documentElement.style.removeProperty('overflow');
});

describe('buildCss', () => {
  test('only includes rules for enabled features', () => {
    const css = buildCss(only('hidePremiumEntry'));
    expect(css).toContain('ytmusic-guide-entry-renderer');
    expect(css).toContain('ytd-guide-entry-renderer');
    expect(css).not.toContain('ytd-reel-shelf-renderer');
    expect(css).not.toContain('ytmusic-mealbar-promo-renderer');
    expect(css).not.toContain('ytmusic-ad-slot-renderer');
  });

  test('includes YouTube ad and Shorts discovery selectors', () => {
    const css = buildCss(only('hideShorts', 'blockAds'));
    expect(css).toContain('ytd-ad-slot-renderer');
    expect(css).toContain('ytd-rich-item-renderer:has(ytd-ad-slot-renderer)');
    expect(css).toContain('ytd-rich-item-renderer:has(ytd-feed-nudge-renderer)');
    expect(css).toContain('ytd-reel-shelf-renderer');
    expect(css).toContain('a[href^="/shorts/"]');
    expect(css).not.toContain('ytmusic-statement-banner-renderer');
  });

  test('is empty when everything is off', () => {
    expect(buildCss(only()).trim()).toBe('');
  });

  test('Playables rules are independent of the Shorts toggle', () => {
    const css = buildCss(only('hidePlayables'));
    expect(css).toContain('ytd-rich-section-renderer:has(ytd-mini-game-card-view-model)');
    expect(css).toContain('a[href^="/playables/"]');
    expect(css).not.toContain('ytd-reel-shelf-renderer');
  });

  test('membership rules match the join endpoint, not a label', () => {
    const css = buildCss(only('hideMembership'));
    expect(css).toContain('[data-clean-youtube-membership-hidden]');
    expect(css).not.toContain('tp-yt-paper-dialog');
    expect(css).not.toContain('ytd-reel-shelf-renderer');
  });

  test('Premium banner rule requires a Premium link', () => {
    expect(CSS.blockUpsell).toContain(
      'ytd-rich-section-renderer:has(ytd-brand-video-singleton-renderer)',
    );
    expect(CSS.blockUpsell).toContain(
      'ytd-statement-banner-renderer:has(a[href="/premium"]',
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

  test('dismisses a music promo whose offer is a button, not a Premium link', () => {
    document.body.innerHTML = `
      <ytmusic-popup-container>
        <ytmusic-mealbar-promo-renderer dialog="true" tabindex="-1">
          <div class="messages">
            <yt-formatted-string>Profitez de musique sans pub à prix réduit avec l'abonnement étudiant YouTube Music Premium</yt-formatted-string>
          </div>
          <div class="button-wrapper">
            <yt-button-renderer class="dismiss-button" dialog-dismiss="">
              <yt-button-shape><button aria-label="Non, merci">Non, merci</button></yt-button-shape>
            </yt-button-renderer>
            <yt-button-renderer class="action-button" dialog-confirm="">
              <yt-button-shape><button>1 mois d’essai</button></yt-button-shape>
            </yt-button-renderer>
          </div>
        </ytmusic-mealbar-promo-renderer>
      </ytmusic-popup-container>`;
    let clicks = 0;
    document.querySelector('.dismiss-button button')!.addEventListener('click', () => clicks++);

    expect(buildCss(only('blockUpsell'))).toContain('ytmusic-mealbar-promo-renderer:not([dialog])');
    expect(dismissUpsells()).toBe(true);
    expect(clicks).toBe(1);
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

  test('uses the Premium dialog dismiss control and leaves cleanup to the page', () => {
    document.body.innerHTML = `
      <ytd-popup-container>
        <tp-yt-paper-dialog opened>
          <a href="https://www.youtube.com/premium">Try Premium</a>
          <button dialog-dismiss>Close</button>
        </tp-yt-paper-dialog>
      </ytd-popup-container>
      <tp-yt-iron-overlay-backdrop class="opened"></tp-yt-iron-overlay-backdrop>`;

    let clicks = 0;
    document.querySelector('button')!.addEventListener('click', () => clicks++);
    expect(dismissUpsells()).toBe(true);
    expect(clicks).toBe(1);
    expect(document.querySelector('tp-yt-paper-dialog')).not.toBeNull();
    expect(document.querySelector('tp-yt-iron-overlay-backdrop')).not.toBeNull();
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

  test('lets an unskippable ad play out when seeking is not opted into', () => {
    document.body.innerHTML = '<div id="movie_player" class="ad-showing"><video></video></div>';
    const video = document.querySelector<HTMLVideoElement>('video')!;
    Object.defineProperty(video, 'duration', { value: 12, configurable: true });

    expect(skipPlayerAd()).toBe(false);
    expect(video.currentTime).toBe(0);
    expect(video.muted).toBe(true);
  });

  test('seeks past an unskippable ad when opted in', () => {
    document.body.innerHTML = '<div id="movie_player" class="ad-showing"><video></video></div>';
    const video = document.querySelector<HTMLVideoElement>('video')!;
    Object.defineProperty(video, 'duration', { value: 12, configurable: true });

    expect(skipPlayerAd(document, true)).toBe(true);
    expect(video.currentTime).toBe(12);
  });

  test('does not seek while the ad duration is still unknown', () => {
    document.body.innerHTML = '<div id="movie_player" class="ad-showing"><video></video></div>';
    const video = document.querySelector<HTMLVideoElement>('video')!;
    Object.defineProperty(video, 'duration', { value: NaN, configurable: true });

    expect(skipPlayerAd(document, true)).toBe(false);
    expect(video.currentTime).toBe(0);
  });

  test('mutes the player video, not a stray one earlier in the document', () => {
    document.body.innerHTML = `
      <video id="decoy"></video>
      <div id="movie_player" class="ad-showing">
        <video id="player" class="html5-main-video"></video>
      </div>`;

    skipPlayerAd();

    expect(document.querySelector<HTMLVideoElement>('#player')!.muted).toBe(true);
    expect(document.querySelector<HTMLVideoElement>('#decoy')!.muted).toBe(false);
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

  test('restores sound when ad blocking stops mid-ad', () => {
    document.body.innerHTML = '<div id="movie_player" class="ad-showing"><video></video></div>';
    const video = document.querySelector<HTMLVideoElement>('video')!;

    skipPlayerAd();
    expect(video.muted).toBe(true);

    expect(restorePlayerMute()).toBe(true);
    expect(video.muted).toBe(false);
    expect(restorePlayerMute()).toBe(false);
  });
});

describe('regressions', () => {
  test('a hidden overlay cannot mute or seek ordinary Music content', () => {
    document.body.innerHTML = '<div id="movie_player"><video class="html5-main-video"></video><div class="ytp-ad-player-overlay" hidden></div></div>';
    const video = document.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: 180 });
    expect(skipPlayerAd(document, true)).toBe(false);
    expect(video.muted).toBe(false);
    expect(video.currentTime).toBe(0);
  });

  test('a different active player cannot affect an earlier normal video or skip button', () => {
    document.body.innerHTML = '<div id="player"><video id="content" class="html5-main-video"></video><button class="ytp-ad-skip-button">stale</button></div><div id="movie_player" class="ad-showing"><video id="ad"></video></div>';
    let clicks = 0;
    document.querySelector('button')!.addEventListener('click', () => clicks++);
    skipPlayerAd();
    expect(document.querySelector<HTMLVideoElement>('#content')!.muted).toBe(false);
    expect(document.querySelector<HTMLVideoElement>('#ad')!.muted).toBe(true);
    expect(clicks).toBe(0);
  });

  test('muting is maintained and detached players are restored on replacement', () => {
    document.body.innerHTML = '<div id="movie_player" class="ad-showing"><video></video></div>';
    const first = document.querySelector('video')!;
    skipPlayerAd();
    first.muted = false;
    skipPlayerAd();
    expect(first.muted).toBe(true);
    const next = document.createElement('video');
    first.replaceWith(next);
    skipPlayerAd();
    expect(first.muted).toBe(false);
    expect(next.muted).toBe(true);
    restorePlayerMute();
    expect(next.muted).toBe(false);
  });

  test('disabled and ancestor-hidden skip controls do not prevent the Music fallback', () => {
    document.body.innerHTML = '<div id="movie_player" class="ad-showing"><video></video><button class="ytp-ad-skip-button" disabled>later</button><div style="display:none"><button class="ytp-ad-skip-button-modern">stale</button></div></div>';
    const video = document.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: 12 });
    expect(skipPlayerAd(document, true)).toBe(true);
    expect(video.currentTime).toBe(12);
  });

  test('an enabled modern skip control is selected after an unavailable legacy one', () => {
    document.body.innerHTML = '<div id="movie_player" class="ad-showing"><video></video><button class="ytp-ad-skip-button" disabled>later</button><button class="ytp-ad-skip-button-modern">skip</button></div>';
    let clicks = 0;
    document.querySelector('.ytp-ad-skip-button-modern')!.addEventListener('click', () => clicks++);
    expect(skipPlayerAd()).toBe(true);
    expect(clicks).toBe(1);
  });

  test('Premium matching rejects handles, query strings, external hosts and route prefixes', () => {
    document.body.innerHTML = ['/\u0040premium_news', '/watch?v=premium', 'https://example.com/premium', '/premium-channel'].map((href) => `<ytd-guide-entry-renderer><a href="${href}">Other</a></ytd-guide-entry-renderer>`).join('');
    hidePremiumGuideEntries();
    expect(document.querySelector('[data-clean-youtube-hidden]')).toBeNull();
  });

  test('Premium route query strings match and recycled entries lose their markers', () => {
    document.body.innerHTML = '<ytd-guide-entry-renderer><a href="https://www.youtube.com/premium?source=guide">Premium</a></ytd-guide-entry-renderer>';
    const entry = document.querySelector<HTMLElement>('ytd-guide-entry-renderer')!;
    hidePremiumGuideEntries();
    expect(entry.dataset.cleanYoutubeHidden).toBe('1');
    document.querySelector('a')!.setAttribute('href', '/feed/library');
    hidePremiumGuideEntries();
    expect(entry.dataset.cleanYoutubeHidden).toBeUndefined();
    entry.dataset.cleanYoutubeHidden = '1';
    clearPremiumGuideEntries();
    expect(entry.dataset.cleanYoutubeHidden).toBeUndefined();
  });

  test('dismissing a mealbar preserves unrelated modal backdrops and scroll locks', () => {
    document.body.innerHTML = '<ytmusic-mealbar-promo-renderer><button class="dismiss-button">dismiss</button></ytmusic-mealbar-promo-renderer><ytd-popup-container><tp-yt-paper-dialog opened>Playlist</tp-yt-paper-dialog></ytd-popup-container><tp-yt-iron-overlay-backdrop class="opened"></tp-yt-iron-overlay-backdrop>';
    document.documentElement.style.overflow = 'hidden';
    expect(dismissUpsells()).toBe(true);
    expect(document.querySelector('tp-yt-paper-dialog[opened]')).not.toBeNull();
    expect(document.querySelector('tp-yt-iron-overlay-backdrop.opened')).not.toBeNull();
    expect(document.documentElement.style.overflow).toBe('hidden');
  });

  test('dialogs without a usable native dismiss control remain intact', () => {
    document.body.innerHTML = '<ytd-popup-container><tp-yt-paper-dialog opened><a href="/premium">Premium</a><button dialog-dismiss disabled>Close</button></tp-yt-paper-dialog></ytd-popup-container>';
    expect(dismissUpsells()).toBe(false);
    expect(document.querySelector('tp-yt-paper-dialog[opened]')).not.toBeNull();
    expect(CSS.blockUpsell).not.toContain('tp-yt-paper-dialog:has(');
  });

  test('membership dismissal validates the destination and uses its native button', () => {
    document.body.innerHTML = '<ytd-popup-container><tp-yt-paper-dialog opened><a href="/channel/abc/join?source=offer">Join</a><button dialog-dismiss>Close</button></tp-yt-paper-dialog></ytd-popup-container>';
    const dialog = document.querySelector('tp-yt-paper-dialog')!;
    document.querySelector('button')!.addEventListener('click', () => dialog.removeAttribute('opened'));
    expect(dismissMembershipDialogs()).toBe(true);
    expect(dialog.hasAttribute('opened')).toBe(false);
    dialog.setAttribute('opened', '');
    document.querySelector('a')!.setAttribute('href', 'https://example.com/channel/abc/join');
    expect(dismissMembershipDialogs()).toBe(false);
    expect(dialog.hasAttribute('opened')).toBe(true);
  });

  test('membership button marking rejects external hosts and lookalike routes', () => {
    document.body.innerHTML = '<ytd-button-renderer id="join"><a href="/channel/abc/join?source=button">Join</a></ytd-button-renderer><ytd-button-renderer id="external"><a href="https://example.com/channel/abc/join">Other</a></ytd-button-renderer><ytd-button-renderer id="lookalike"><a href="/channel/abc/joined">Other</a></ytd-button-renderer>';
    hideMembershipButtons();
    expect(document.querySelector('[data-clean-youtube-membership-hidden]')?.id).toBe('join');
    expect(document.querySelectorAll('[data-clean-youtube-membership-hidden]')).toHaveLength(1);
    document.querySelector('#join a')!.setAttribute('href', '/feed/library');
    hideMembershipButtons();
    expect(document.querySelector('[data-clean-youtube-membership-hidden]')).toBeNull();
  });
});
