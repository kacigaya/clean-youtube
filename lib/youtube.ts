import type { Settings } from './settings';

/** Locale-independent marker: `d` prefix of the Premium entry icon in the sidebar. */
const PREMIUM_ICON_PATH = 'M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11';

const PREMIUM_LINK = [
  'a[href*="premium" i]',
  'a[href*="paid_memberships" i]',
  'a[href*="musicpremium" i]',
].join(',');

const SHORTS_LINK = 'a[href="/shorts"],a[href^="/shorts/"]';

/** Static rules per feature, injected as one stylesheet built from the enabled ones. */
export const CSS: Record<keyof Settings, string> = {
  hidePremiumEntry: `
    ytmusic-guide-entry-renderer:has(${PREMIUM_LINK}),
    ytd-guide-entry-renderer:has(${PREMIUM_LINK}),
    ytd-mini-guide-entry-renderer:has(${PREMIUM_LINK}),
    [data-clean-youtube-hidden] { display: none !important; }
  `,
  hideShorts: `
    ytd-guide-entry-renderer:has(${SHORTS_LINK}),
    ytd-mini-guide-entry-renderer:has(${SHORTS_LINK}),
    ytd-reel-shelf-renderer,
    ytd-rich-section-renderer:has(${SHORTS_LINK}),
    ytd-rich-item-renderer:has(${SHORTS_LINK}),
    ytd-video-renderer:has(${SHORTS_LINK}),
    .ytLockupViewModelWrapper:has(${SHORTS_LINK}) { display: none !important; }
  `,
  blockUpsell: `
    ytd-rich-section-renderer:has(ytd-brand-video-singleton-renderer),
    ytd-rich-item-renderer:has(ytd-brand-video-singleton-renderer),
    ytd-brand-video-singleton-renderer,
    ytmusic-mealbar-promo-renderer:has(${PREMIUM_LINK}),
    ytd-mealbar-promo-renderer:has(${PREMIUM_LINK}),
    ytmusic-statement-banner-renderer:has(${PREMIUM_LINK}),
    ytd-statement-banner-renderer:has(${PREMIUM_LINK}),
    ytmusic-popup-container tp-yt-paper-dialog:has(${PREMIUM_LINK}),
    ytd-popup-container tp-yt-paper-dialog:has(${PREMIUM_LINK}) { display: none !important; }
  `,
  /**
   * Feed and sidebar ad containers only. Nothing inside the player is hidden:
   * YouTube measures its own ad containers there, and a zero-sized one is read
   * as ad blocking. Player ads are handled by skipPlayerAd instead.
   */
  blockAds: `
    ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
    ytd-rich-item-renderer:has(ytd-feed-nudge-renderer),
    ytd-feed-nudge-renderer,
    ytmusic-ad-slot-renderer,
    ytmusic-ad-renderer,
    ytmusic-companion-ad-renderer,
    ytmusic-player-legacy-ad-renderer,
    ytmusic-ad-preview-renderer,
    ytd-ad-slot-renderer,
    ytd-in-feed-ad-layout-renderer,
    ytd-promoted-sparkles-web-renderer,
    ytd-display-ad-renderer,
    ytd-companion-slot-renderer { display: none !important; }
  `,
};

export function buildCss(settings: Settings): string {
  return (Object.keys(CSS) as (keyof Settings)[])
    .filter((key) => settings[key])
    .map((key) => CSS[key])
    .join('\n');
}

/**
 * Mark sidebar entries that point at Premium, matched by link or by icon.
 * The icon check catches localised entries ("S'abonner", "Subscribe", ...) that
 * a text match would miss, and the CSS rule above hides whatever is marked.
 */
export function hidePremiumGuideEntries(root: ParentNode = document) {
  for (const entry of root.querySelectorAll<HTMLElement>(
    'ytmusic-guide-entry-renderer, ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer',
  )) {
    if (entry.dataset.cleanYoutubeHidden) continue;
    const isPremium =
      entry.querySelector(PREMIUM_LINK) != null ||
      entry.querySelector(`svg path[d^="${PREMIUM_ICON_PATH}"]`) != null;
    if (isPremium) entry.dataset.cleanYoutubeHidden = '1';
  }
}

/** Close Premium promos. CSS hides them; this releases the modal state they leave behind. */
export function dismissUpsells(root: ParentNode = document) {
  let closed = false;

  for (const promo of root.querySelectorAll(
    'ytmusic-mealbar-promo-renderer, ytd-mealbar-promo-renderer',
  )) {
    if (!promo.querySelector(PREMIUM_LINK)) continue;
    // A comma selector would return the wrapper first; the inner button is the real target.
    const dismiss =
      promo.querySelector<HTMLElement>('#dismiss-button button') ??
      promo.querySelector<HTMLElement>('#dismiss-button');
    if (dismiss) dismiss.click();
    else promo.remove();
    closed = true;
  }

  for (const dialog of root.querySelectorAll<HTMLElement & { close?: () => void }>(
    'ytmusic-popup-container tp-yt-paper-dialog[opened], ytd-popup-container tp-yt-paper-dialog[opened]',
  )) {
    if (!dialog.querySelector(PREMIUM_LINK)) continue;
    dialog.close?.();
    dialog.remove();
    closed = true;
  }

  // Polymer leaves the backdrop (and a scroll lock) behind when a dialog is torn down.
  if (closed) {
    for (const backdrop of root.querySelectorAll('tp-yt-iron-overlay-backdrop.opened')) {
      backdrop.remove();
    }
    document.documentElement.style.removeProperty('overflow');
  }

  return closed;
}

/** Muted state from before the current ad, restored once it is over. Keyed on the
 * media element so a replaced player starts from that player's own state. */
const mutedBeforeAd = new WeakMap<HTMLVideoElement, boolean>();

function getPlayerVideo(root: ParentNode): HTMLVideoElement | null {
  // Two calls, not one selector list: a list matches in document order, so a
  // stray <video> ahead of the player would win over the real one.
  return (
    root.querySelector<HTMLVideoElement>('video.html5-main-video') ??
    root.querySelector<HTMLVideoElement>('video')
  );
}

/** Restore a player muted by skipPlayerAd, including when blocking stops mid-ad. */
export function restorePlayerMute(root: ParentNode = document) {
  const video = getPlayerVideo(root);
  if (!video || !mutedBeforeAd.has(video)) return false;

  video.muted = mutedBeforeAd.get(video)!;
  mutedBeforeAd.delete(video);
  return true;
}

/**
 * Get through the ad currently playing: mute it, and click skip if YouTube
 * offers the button.
 *
 * `seekPastAd` also jumps an unskippable ad to its end, which clears it outright
 * instead of leaving it to play silent. That is only safe on YouTube Music.
 * Seeking reports the ad as watched in ~0 ms with the player's quartile progress
 * pings all firing in one frame, and youtube.com flags that shape server-side to
 * raise the "ad blockers violate YouTube's Terms of Service" wall. YouTube Music
 * runs no such enforcement today, so callers there opt in.
 */
export function skipPlayerAd(root: ParentNode = document, seekPastAd = false) {
  const video = getPlayerVideo(root);

  if (!root.querySelector('.ad-showing, .ytp-ad-player-overlay')) {
    restorePlayerMute(root);
    return false;
  }

  if (video && !mutedBeforeAd.has(video)) {
    mutedBeforeAd.set(video, video.muted);
    video.muted = true;
  }

  const skip = root.querySelector<HTMLElement>(
    '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button',
  );
  if (skip) {
    skip.click();
    return true;
  }

  if (seekPastAd && video && Number.isFinite(video.duration) && video.duration > 0) {
    video.currentTime = video.duration;
    return true;
  }

  return false;
}
