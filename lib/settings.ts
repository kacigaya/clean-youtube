import { storage } from '#imports';

export interface Settings {
  /** Hide Premium entries in the YouTube and YouTube Music sidebars. */
  hidePremiumEntry: boolean;
  /** Hide Shorts discovery UI on YouTube while keeping direct URLs usable. */
  hideShorts: boolean;
  /** Hide the Playables games shelf and its sidebar entry on YouTube. */
  hidePlayables: boolean;
  /** Hide channel membership Join buttons and the offers they open. */
  hideMembership: boolean;
  /** Auto-dismiss Premium ads, dialogs and promo bars. */
  blockUpsell: boolean;
  /** Mute and skip player ads as they start, and hide feed and sidebar ad slots. */
  blockAds: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  hidePremiumEntry: true,
  hideShorts: true,
  hidePlayables: true,
  hideMembership: true,
  blockUpsell: true,
  blockAds: true,
};

export const settingsItem = storage.defineItem<Settings>('sync:settings', {
  fallback: DEFAULT_SETTINGS,
});

/** Stored value may predate a newly added key, so fill the gaps. */
export function withDefaults(value: Partial<Settings> | null | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...value };
}

export async function getSettings(): Promise<Settings> {
  return withDefaults(await settingsItem.getValue());
}
