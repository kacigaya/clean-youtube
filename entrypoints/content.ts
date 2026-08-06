import { DEFAULT_SETTINGS, getSettings, settingsItem, type Settings, withDefaults } from '@/lib/settings';
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
      settings = withDefaults(value);
      applyCss();
      sweep();
    });

    const observer = new MutationObserver(sweep);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // An extension reload invalidates this context; the observer and stylesheet outlive it.
    ctx.onInvalidated(() => {
      observer.disconnect();
      style.remove();
    });

    // Ads flip a class on the player rather than adding nodes, so poll instead of
    // observing. Frequently, because the poll is what the viewer hears as ad length.
    ctx.setInterval(() => {
      if (settings.blockAds) skipPlayerAd();
    }, 200);
  },
});
