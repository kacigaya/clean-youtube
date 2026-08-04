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
    ytmusic-mealbar-promo-renderer:has(${PREMIUM_LINK}),
    ytd-mealbar-promo-renderer:has(${PREMIUM_LINK}),
    ytmusic-statement-banner-renderer:has(${PREMIUM_LINK}),
    ytd-statement-banner-renderer:has(${PREMIUM_LINK}),
    ytmusic-popup-container tp-yt-paper-dialog:has(${PREMIUM_LINK}),
    ytd-popup-container tp-yt-paper-dialog:has(${PREMIUM_LINK}) { display: none !important; }
  `,
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

/**
 * Get through the ad currently playing: mute it, click skip if it is offered,
 * otherwise seek to its end.
 *
 * This runs on the ad YouTube served rather than removing it from the player
 * response, so YouTube sees an ad that played and never reaches for the
 * "ad blockers violate YouTube's Terms of Service" wall.
 */
export function skipPlayerAd(root: ParentNode = document) {
  const video = root.querySelector<HTMLVideoElement>('video.html5-main-video, video');

  if (!root.querySelector('.ad-showing, .ytp-ad-player-overlay')) {
    if (video && mutedBeforeAd.has(video)) {
      video.muted = mutedBeforeAd.get(video)!;
      mutedBeforeAd.delete(video);
    }
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

  // Seeking to the end ends the ad; the player then loads the video as usual.
  if (video && Number.isFinite(video.duration) && video.duration > 0) {
    video.currentTime = video.duration;
    return true;
  }

  return false;
}
