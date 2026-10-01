import type { Settings } from './settings';

/** Locale-independent marker: `d` prefix of the Premium entry icon in the sidebar. */
const PREMIUM_ICON_PATH = 'M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11';

const YOUTUBE_ORIGINS = ['https://www.youtube.com', 'https://music.youtube.com', 'https://youtube.com'];

function routeLinks(paths: string[]): string {
  return paths.flatMap((path) => ['', ...YOUTUBE_ORIGINS].flatMap((origin) => {
    const href = `${origin}${path}`;
    return [`a[href="${href}"]`, ...['/', '?', '#'].map((suffix) => `a[href^="${href}${suffix}"]`)];
  })).join(',');
}

const PREMIUM_LINK = routeLinks(['/premium', '/paid_memberships', '/musicpremium']);

const SHORTS_LINK = 'a[href="/shorts"],a[href^="/shorts/"]';

const PLAYABLES_LINK = 'a[href="/playables"],a[href^="/playables/"]';

function linksTo(root: ParentNode, matches: (path: string) => boolean): boolean {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')).some((link) => {
    try {
      const url = new URL(link.getAttribute('href')!, 'https://www.youtube.com');
      return YOUTUBE_ORIGINS.includes(url.origin) && matches(url.pathname);
    } catch {
      return false;
    }
  });
}

const hasPremiumLink = (root: ParentNode) => linksTo(root,
  (path) => /^\/(?:premium|paid_memberships|musicpremium)(?:\/|$)/.test(path));
const hasMembershipLink = (root: ParentNode) => linksTo(root,
  (path) => /^\/channel\/[^/]+\/join\/?$/.test(path));

/** Static rules per feature, used by native content CSS and browser fixtures. */
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
  /**
   * The shelf is matched by its game cards rather than its heading, which is
   * localised ("Jeux integres YouTube", "YouTube Playables", ...).
   */
  hidePlayables: `
    ytd-guide-entry-renderer:has(${PLAYABLES_LINK}),
    ytd-mini-guide-entry-renderer:has(${PLAYABLES_LINK}),
    ytd-rich-section-renderer:has(ytd-mini-game-card-view-model),
    ytd-rich-item-renderer:has(ytd-mini-game-card-view-model),
    ytd-mini-game-card-view-model { display: none !important; }
  `,
  /**
   * Matched by the join endpoint, never by the button label. Three button
   * wrappers because YouTube is mid-migration from `ytd-button-renderer` to the
   * view-model elements, and both shapes are live depending on the surface.
   */
  hideMembership: `
    [data-clean-youtube-membership-hidden] { display: none !important; }
  `,
  blockUpsell: `
    ytd-rich-section-renderer:has(ytd-brand-video-singleton-renderer),
    ytd-rich-item-renderer:has(ytd-brand-video-singleton-renderer),
    ytd-brand-video-singleton-renderer,
    ytmusic-mealbar-promo-renderer:not([dialog]):not(tp-yt-paper-dialog *),
    ytd-mealbar-promo-renderer:not([dialog]):not(tp-yt-paper-dialog *):has(${PREMIUM_LINK}),
    ytmusic-statement-banner-renderer:has(${PREMIUM_LINK}),
    ytd-statement-banner-renderer:has(${PREMIUM_LINK}) { display: none !important; }
  `,
  /**
   * Feed and sidebar ad containers only. Nothing inside the player is hidden:
   * Preserve the player's layout. Player ads are handled by skipPlayerAd instead.
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

/** Browser-owned content CSS, gated by removable feature attributes. */
export function buildFeatureCss(): string {
  return (Object.keys(CSS) as (keyof Settings)[])
    .map((key) => `html[data-clean-youtube-${key.toLowerCase()}] { ${CSS[key]} }`)
    .join('\n');
}

function queryWithin(root: ParentNode, selector: string): HTMLElement[] {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(selector));
  if (root instanceof HTMLElement && root.matches(selector)) elements.unshift(root);
  return elements;
}

/**
 * Mark sidebar entries that point at Premium, matched by link or by icon.
 * The icon check catches localised entries ("S'abonner", "Subscribe", ...) that
 * a text match would miss, and the CSS rule above hides whatever is marked.
 */
export function hidePremiumGuideEntries(root: ParentNode = document) {
  for (const entry of queryWithin(root,
    'ytmusic-guide-entry-renderer, ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer',
  )) {
    const isPremium =
      hasPremiumLink(entry) ||
      entry.querySelector(`svg path[d^="${PREMIUM_ICON_PATH}"]`) != null;
    if (isPremium) entry.dataset.cleanYoutubeHidden = '1';
    else delete entry.dataset.cleanYoutubeHidden;
  }
}

export function clearPremiumGuideEntries(root: ParentNode = document) {
  for (const entry of queryWithin(root, '[data-clean-youtube-hidden]')) {
    delete entry.dataset.cleanYoutubeHidden;
  }
}

export function hideMembershipButtons(root: ParentNode = document) {
  for (const button of queryWithin(root,
    'ytd-button-renderer, yt-button-view-model, button-view-model',
  )) {
    if (hasMembershipLink(button)) button.dataset.cleanYoutubeMembershipHidden = '1';
    else delete button.dataset.cleanYoutubeMembershipHidden;
  }
}

export function clearMembershipButtons(root: ParentNode = document) {
  for (const button of queryWithin(root, '[data-clean-youtube-membership-hidden]')) {
    delete button.dataset.cleanYoutubeMembershipHidden;
  }
}

function isEnabled(element: HTMLElement): boolean {
  return !element.closest('[disabled], [aria-disabled="true"]') && !element.matches(':disabled');
}

function isActionable(element: HTMLElement): boolean {
  if (!isEnabled(element) || element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  }
  return true;
}

function clickDismiss(root: ParentNode): boolean {
  // Prefer the real button; clicking a wrapper can miss its page-owned handler.
  const dismiss = Array.from(root.querySelectorAll<HTMLElement>(
    '#dismiss-button button, .dismiss-button button, [dialog-dismiss] button, #close-button button, button[dialog-dismiss], button#dismiss-button, button#close-button',
  )).find(isActionable) ?? Array.from(root.querySelectorAll<HTMLElement>(
    '#dismiss-button, .dismiss-button, [dialog-dismiss], #close-button',
  )).find((control) => !control.querySelector('button') && isActionable(control));
  if (!dismiss) return false;
  dismiss.click();
  return true;
}

function dismissDialogs(root: ParentNode, matches: (dialog: ParentNode) => boolean): boolean {
  let dismissed = false;
  for (const dialog of queryWithin(root,
    'ytmusic-popup-container tp-yt-paper-dialog[opened], ytd-popup-container tp-yt-paper-dialog[opened]',
  )) {
    if (matches(dialog)) dismissed = clickDismiss(dialog) || dismissed;
  }
  return dismissed;
}

/** Native clicks reach page listeners from an isolated content-script world. */
export function dismissUpsells(root: ParentNode = document) {
  let dismissed = false;

  for (const promo of queryWithin(root,
    'ytmusic-mealbar-promo-renderer, ytd-mealbar-promo-renderer',
  )) {
    // Music mealbars are Premium upsells only, and most carry no Premium link at
    // all — the offer sits on a plain button. On youtube.com the same element
    // also carries product notices, so there it stays matched by the link.
    if (promo.tagName !== 'YTMUSIC-MEALBAR-PROMO-RENDERER' && !hasPremiumLink(promo)) {
      continue;
    }
    dismissed = clickDismiss(promo) || dismissed;
  }
  return dismissDialogs(root, hasPremiumLink) || dismissed;
}

export function dismissMembershipDialogs(root: ParentNode = document) {
  return dismissDialogs(root, hasMembershipLink);
}

/** Keep only the current ad's video so replacement and teardown can restore
 * even a detached player. Old entries are released on the next poll. */
const mutedBeforeAd = new Map<HTMLVideoElement, boolean>();

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
  let restored = false;
  for (const [video, muted] of mutedBeforeAd) {
    if (root !== document && !root.contains(video)) continue;
    video.muted = muted;
    mutedBeforeAd.delete(video);
    restored = true;
  }
  return restored;
}

/**
 * Get through the ad currently playing: mute it, and click skip if YouTube
 * offers the button.
 *
 * `seekPastAd` also jumps an unskippable ad to its end, which clears it outright
 * instead of leaving it to play silent. Callers opt in only on YouTube Music;
 * the YouTube path preserves playback position. Platform enforcement can change,
 * so Music seeking remains a deliberate limitation rather than a guarantee.
 */
export function skipPlayerAd(root: ParentNode = document, seekPastAd = false) {
  const player = root.querySelector<HTMLElement>('#movie_player.ad-showing, #player.ad-showing');
  const video = player ? getPlayerVideo(player) : null;
  // Overlay nodes and inactive skip controls can remain after an ad ends.
  if (!video || !player) {
    restorePlayerMute(root);
    return false;
  }

  for (const [previous, muted] of mutedBeforeAd) {
    if (previous !== video) {
      previous.muted = muted;
      mutedBeforeAd.delete(previous);
    }
  }

  if (!mutedBeforeAd.has(video)) {
    mutedBeforeAd.set(video, video.muted);
  }
  video.muted = true;

  const skip = Array.from(player.querySelectorAll<HTMLElement>(
    '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button',
  )).find(isActionable);
  if (skip) {
    skip.click();
    return true;
  }

  if (seekPastAd && Number.isFinite(video.duration) && video.duration > 0) {
    video.currentTime = video.duration;
    return true;
  }

  return false;
}
