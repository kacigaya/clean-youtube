import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { DEFAULT_SETTINGS, SETTING_KEYS, subscribeSettings, type Settings } from './settings';
import {
  clearPremiumGuideEntries,
  clearMembershipButtons,
  dismissMembershipDialogs,
  dismissUpsells,
  hidePremiumGuideEntries,
  hideMembershipButtons,
  restorePlayerMute,
  skipPlayerAd,
} from './youtube';

function setFeatureAttributes(settings: Settings | null) {
  for (const key of SETTING_KEYS) {
    document.documentElement.toggleAttribute(`data-clean-youtube-${key.toLowerCase()}`, settings?.[key] ?? false);
  }
}

const SWEEP_TARGETS = 'ytmusic-guide-entry-renderer, ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytd-button-renderer, yt-button-view-model, button-view-model, ytmusic-mealbar-promo-renderer, ytd-mealbar-promo-renderer, tp-yt-paper-dialog, ytd-popup-container, ytmusic-popup-container';

export function startContent(ctx: ContentScriptContext) {
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let settingsReady = false;
  let stopped = false;
  let frame: number | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  const roots = new Set<Document | Element>();
  let unsubscribe = () => {};
  const seekPastAd = location.hostname === 'music.youtube.com';
  const hasPlayer = () => document.getElementById('movie_player') !== null || document.getElementById('player') !== null;
  const syncPlayerPoll = () => {
    if (stopped || !settingsReady || !settings.blockAds || !hasPlayer()) {
      if (poll !== undefined) clearInterval(poll);
      poll = undefined;
      restorePlayerMute();
    } else if (poll === undefined) {
      // Own the interval explicitly; restarting it must not accumulate context
      // invalidation listeners. Teardown below always clears it.
      poll = setInterval(() => {
        if (ctx.isInvalid || stopped) return;
        if (!hasPlayer()) syncPlayerPoll();
        else skipPlayerAd(document, seekPastAd);
      }, 200);
    }
  };
  const sweep = (root: Document | Element = document) => {
    if (stopped || ctx.isInvalid || !settingsReady ||
        !(settings.hidePremiumEntry || settings.blockUpsell || settings.hideMembership)) return;
    // Merge overlapping roots so one mutation batch visits each subtree once.
    for (const queued of roots) {
      if (queued.contains(root)) return;
      if (root.contains(queued)) roots.delete(queued);
    }
    roots.add(root);
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      if (stopped || ctx.isInvalid) return;
      const affected = [...roots];
      roots.clear();
      for (const root of affected) {
        if (!root.isConnected) continue;
        if (settings.hidePremiumEntry) hidePremiumGuideEntries(root);
        if (settings.blockUpsell) dismissUpsells(root);
        if (settings.hideMembership) {
          hideMembershipButtons(root);
          dismissMembershipDialogs(root);
        }
      }
    });
  };
  const observer = new MutationObserver((records) => {
    if (stopped || ctx.isInvalid) return;
    syncPlayerPoll();
    for (const record of records) {
      // Reclassify affected ancestors after link/icon/control changes or removals.
      for (let target = record.target instanceof Element ? record.target : record.target.parentElement;
           target; target = target.parentElement) {
        if (target.matches(SWEEP_TARGETS)) sweep(target);
      }
      if (record.type === 'childList') {
        for (const node of record.addedNodes) if (node instanceof Element) sweep(node);
      } else if (['hidden', 'aria-hidden', 'inert', 'style', 'class'].includes(record.attributeName ?? '') && record.target instanceof Element) {
        sweep(record.target);
      }
    }
  });
  // Register before storage access so even a rejected or delayed read is safe.
  ctx.onInvalidated(() => {
    stopped = true;
    observer.disconnect();
    roots.clear();
    if (poll !== undefined) clearInterval(poll);
    if (frame !== undefined) cancelAnimationFrame(frame);
    setFeatureAttributes(null);
    clearPremiumGuideEntries();
    clearMembershipButtons();
    restorePlayerMute();
    unsubscribe();
  });
  if (ctx.isInvalid) return;
  setFeatureAttributes(settings);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['opened', 'dialog', 'href', 'd', 'disabled', 'aria-disabled', 'hidden', 'aria-hidden', 'inert', 'style', 'class', 'id'],
  });
  unsubscribe = subscribeSettings((nextSettings) => {
    if (stopped || ctx.isInvalid) return;
    if (settings.blockAds && !nextSettings.blockAds) restorePlayerMute();
    if (settings.hidePremiumEntry && !nextSettings.hidePremiumEntry) clearPremiumGuideEntries();
    if (settings.hideMembership && !nextSettings.hideMembership) clearMembershipButtons();
    settings = nextSettings;
    settingsReady = true;
    setFeatureAttributes(settings);
    syncPlayerPoll();
    sweep();
  }, (error) => {
    if (stopped || ctx.isInvalid) return;
    console.warn('Clean YouTube could not load settings; retaining current settings.', error);
    // An initial failure must not enable player/dialog actions before a stored
    // disabled preference can be recovered. Later failures keep confirmed state.
    syncPlayerPoll();
    sweep();
  });
}
