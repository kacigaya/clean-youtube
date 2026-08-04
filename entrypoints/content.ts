import { DEFAULT_SETTINGS, getSettings, settingsItem, type Settings } from '@/lib/settings';
import { buildCss, dismissUpsells, hidePremiumGuideEntries, skipPlayerAd } from '@/lib/youtube';

export default defineContentScript({
  matches: ['*://www.youtube.com/*', '*://music.youtube.com/*'],
  runAt: 'document_start',

  async main(ctx) {
    let settings: Settings = DEFAULT_SETTINGS;

    const style = document.createElement('style');
    (document.head ?? document.documentElement).append(style);
    const applyCss = () => {
      style.textContent = buildCss(settings);
      document.documentElement.dataset.cleanYoutubeBlockAds = settings.blockAds ? '1' : '0';
    };

    let queued = false;
    const sweep = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (settings.hidePremiumEntry) hidePremiumGuideEntries();
        if (settings.blockUpsell) dismissUpsells();
      });
    };

    // Defaults are on, so hide first and reconcile once storage answers.
    applyCss();
    settings = await getSettings();
    applyCss();
    sweep();

    settingsItem.watch((value) => {
      settings = { ...DEFAULT_SETTINGS, ...value };
      applyCss();
      sweep();
    });

    new MutationObserver(sweep).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // Ads flip a class on the player rather than adding nodes, so poll instead of observing.
    ctx.setInterval(() => {
      if (settings.blockAds) skipPlayerAd();
    }, 500);
  },
});
