import type { Settings } from './settings';

/** Locale-independent marker: `d` prefix of the Premium entry icon in the sidebar. */
const PREMIUM_ICON_PATH = 'M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11';

const PREMIUM_LINK = [
  'a[href*="premium" i]',
  'a[href*="paid_memberships" i]',
  'a[href*="musicpremium" i]',
].join(',');

const SHORTS_LINK = 'a[href="/shorts"],a[href^="/shorts/"]';

/**
 * Ad and enforcement payloads, as paths inside a player response. The last three
 * are what YouTube uses to detect and punish blocking: the heartbeat params it
 * expects the player to echo back, the Premium upsell dialog, and the ad
 * signals it reads to decide a session is blocking ads.
 */
const AD_PATHS = [
  'adPlacements',
  'adSlots',
  'playerAds',
  'adBreakHeartbeatParams',
  'auxiliaryUi.messageRenderers.upsellDialogRenderer',
  'responseContext.adSignalsInfo',
] as const;

/** Marker of the continuation that raises the "ad blockers violate our ToS" wall. */
const ABNORMALITY_MARKER = 'onAbnormalityDetected';

/** Reading a function's source is expensive, and every promise on the page lands here. */
const ABNORMALITY_SOURCE_LIMIT = 4096;

interface AdBlockRoot {
  JSON: JSON;
  Promise?: PromiseConstructor;
  Response?: { prototype: { json: () => Promise<unknown> } };
  XMLHttpRequest?: { prototype: object };
  playerResponse?: unknown;
  ytInitialPlayerResponse?: unknown;
}

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
    ytmusic-ad-slot-renderer,
    ytmusic-ad-renderer,
    ytmusic-companion-ad-renderer,
    ytmusic-player-legacy-ad-renderer,
    ytmusic-ad-preview-renderer,
    ytd-ad-slot-renderer,
    ytd-in-feed-ad-layout-renderer,
    ytd-promoted-sparkles-web-renderer,
    ytd-display-ad-renderer,
    ytd-companion-slot-renderer,
    ytd-enforcement-message-view-model,
    tp-yt-paper-dialog:has(ytd-enforcement-message-view-model),
    #player-ads,
    .ytp-ad-module,
    .ytp-ad-overlay-container { display: none !important; }
  `,
};

export function buildCss(settings: Settings): string {
  return (Object.keys(CSS) as (keyof Settings)[])
    .filter((key) => settings[key])
    .map((key) => CSS[key])
    .join('\n');
}

function deletePath(target: object, path: string) {
  const keys = path.split('.');
  const leaf = keys.pop()!;
  let node: unknown = target;
  for (const key of keys) {
    if (typeof node !== 'object' || node === null) return;
    node = (node as Record<string, unknown>)[key];
  }
  if (typeof node === 'object' && node !== null) Reflect.deleteProperty(node, leaf);
}

/** Remove ad metadata before YouTube's player can schedule an ad. */
export function prunePlayerAds(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;

  for (const path of AD_PATHS) {
    deletePath(value, path);
    deletePath(value, `playerResponse.${path}`);
  }

  return value;
}

const NOOP = () => {};
const inspectedHandlers = new WeakSet<object>();
const abnormalityHandlers = new WeakSet<object>();

/** Cached because the proxy below sees every promise continuation on the page. */
function isAbnormalityHandler(handler: (value: unknown) => unknown): boolean {
  if (abnormalityHandlers.has(handler)) return true;
  if (inspectedHandlers.has(handler)) return false;
  inspectedHandlers.add(handler);

  let source: string;
  try {
    source = Function.prototype.toString.call(handler);
  } catch {
    return false;
  }
  if (source.length > ABNORMALITY_SOURCE_LIMIT || !source.includes(ABNORMALITY_MARKER)) {
    return false;
  }

  abnormalityHandlers.add(handler);
  return true;
}

/**
 * Pruning the ad metadata is what YouTube looks for: the player notices the ads
 * it expected never played and resolves an `onAbnormalityDetected` continuation,
 * which is what raises the "ad blockers violate YouTube's Terms of Service" wall.
 * Replace that continuation with a no-op and the enforcement never runs.
 */
export function installAbnormalityBypass(
  root: { Promise: PromiseConstructor },
  isEnabled: () => boolean = () => true,
) {
  const then = root.Promise.prototype.then;
  root.Promise.prototype.then = new Proxy(then, {
    apply(target, thisArg, args: Parameters<Promise<unknown>['then']>) {
      const onFulfilled = args[0];
      if (isEnabled() && typeof onFulfilled === 'function' && isAbnormalityHandler(onFulfilled)) {
        args[0] = NOOP;
      }
      return Reflect.apply(target, thisArg, args);
    },
  });
}

/**
 * Install Brave-style player response pruning in the page's main world.
 */
export function installPlayerAdBlocker(
  root: AdBlockRoot,
  isEnabled: () => boolean = () => true,
) {
  if (root.Promise) installAbnormalityBypass({ Promise: root.Promise }, isEnabled);

  const parse = root.JSON.parse;
  root.JSON.parse = new Proxy(parse, {
    apply(target, thisArg, args: Parameters<JSON['parse']>) {
      const value = Reflect.apply(target, thisArg, args);
      return isEnabled() ? prunePlayerAds(value) : value;
    },
  });

  if (root.Response) {
    const json = root.Response.prototype.json;
    root.Response.prototype.json = new Proxy(json, {
      apply(target, thisArg, args) {
        return Reflect.apply(target, thisArg, args).then((value: unknown) =>
          isEnabled() ? prunePlayerAds(value) : value,
        );
      },
    });
  }

  if (root.XMLHttpRequest) {
    const prototype = root.XMLHttpRequest.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'response');
    if (descriptor?.get && descriptor.configurable) {
      Object.defineProperty(prototype, 'response', {
        ...descriptor,
        get() {
          const value = descriptor.get!.call(this);
          return isEnabled() ? prunePlayerAds(value) : value;
        },
      });
    }
  }

  for (const key of ['ytInitialPlayerResponse', 'playerResponse'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(root, key);
    if (descriptor && !descriptor.configurable) continue;
    let value = root[key];
    Object.defineProperty(root, key, {
      configurable: true,
      enumerable: true,
      get: () => value,
      set: (next) => {
        value = isEnabled() ? prunePlayerAds(next) : next;
      },
    });
  }
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

/** Skip the ad currently playing: use the skip button if offered, otherwise seek past it. */
export function skipPlayerAd(root: ParentNode = document) {
  if (!root.querySelector('.ad-showing, .ytp-ad-player-overlay')) return false;

  const skip = root.querySelector<HTMLElement>(
    '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button',
  );
  if (skip) {
    skip.click();
    return true;
  }

  const video = root.querySelector<HTMLVideoElement>('video.html5-main-video, video');
  if (video && Number.isFinite(video.duration) && video.duration > 0) {
    video.currentTime = video.duration;
    return true;
  }

  return false;
}
