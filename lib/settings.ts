import { storage } from '#imports';

export interface Settings {
  /** Hide Premium entries in the YouTube and YouTube Music sidebars. */
  hidePremiumEntry: boolean;
  /** Hide Shorts discovery UI on YouTube while keeping direct URLs usable. */
  hideShorts: boolean;
  /** Auto-dismiss Premium ads, dialogs and promo bars. */
  blockUpsell: boolean;
  /** Remove player ad metadata, with DOM hiding and skipping as fallbacks. */
  blockAds: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  hidePremiumEntry: true,
  hideShorts: true,
  blockUpsell: true,
  blockAds: true,
};

export const settingsItem = storage.defineItem<Settings>('sync:settings', {
  fallback: DEFAULT_SETTINGS,
});

/** Stored value may predate a newly added key, so fill the gaps. */
export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
}
