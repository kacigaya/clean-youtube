import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { DEFAULT_SETTINGS, subscribeSettings, type Settings } from './settings';
import {
  buildCss,
  clearPremiumGuideEntries,
  clearMembershipButtons,
  dismissMembershipDialogs,
  dismissUpsells,
  hidePremiumGuideEntries,
  hideMembershipButtons,
  restorePlayerMute,
  skipPlayerAd,
} from './youtube';

export function startContent(ctx: ContentScriptContext) {
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let settingsReady = false;
  let stopped = false;
  let frame: number | undefined;
  let unsubscribe = () => {};
  const style = document.createElement('style');
  const sweep = () => {
    if (stopped || ctx.isInvalid || !settingsReady || frame !== undefined ||
        !(settings.hidePremiumEntry || settings.blockUpsell || settings.hideMembership)) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      if (stopped || ctx.isInvalid) return;
      if (settings.hidePremiumEntry) hidePremiumGuideEntries();
      if (settings.blockUpsell) dismissUpsells();
      if (settings.hideMembership) {
        hideMembershipButtons();
        dismissMembershipDialogs();
      }
    });
  };
  const observer = new MutationObserver(sweep);
  // Register before storage access so even a rejected or delayed read is safe.
  ctx.onInvalidated(() => {
    stopped = true;
    observer.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
    style.remove();
    clearPremiumGuideEntries();
    clearMembershipButtons();
    restorePlayerMute();
    unsubscribe();
  });
  if (ctx.isInvalid) return;
  (document.head ?? document.documentElement).append(style);
  style.textContent = buildCss(settings);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['opened', 'dialog', 'href', 'd', 'disabled', 'aria-disabled'],
  });
  unsubscribe = subscribeSettings((nextSettings) => {
    if (stopped || ctx.isInvalid) return;
    if (settings.blockAds && !nextSettings.blockAds) restorePlayerMute();
    if (settings.hidePremiumEntry && !nextSettings.hidePremiumEntry) clearPremiumGuideEntries();
    if (settings.hideMembership && !nextSettings.hideMembership) clearMembershipButtons();
    settings = nextSettings;
    settingsReady = true;
    const css = buildCss(settings);
    if (style.textContent !== css) style.textContent = css;
    sweep();
  }, (error) => {
    if (stopped || ctx.isInvalid) return;
    console.warn('Clean YouTube could not load settings; retaining current settings.', error);
    settingsReady = true;
    sweep();
  });
  // Seeking is limited to a confirmed active Music ad in the selected player.
  const seekPastAd = location.hostname === 'music.youtube.com';
  ctx.setInterval(() => {
    if (settingsReady && settings.blockAds) skipPlayerAd(document, seekPastAd);
  }, 200);
}
