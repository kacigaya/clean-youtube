import { storage } from 'wxt/utils/storage';

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

const legacySettingsItem = storage.defineItem<unknown>('sync:settings');
export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];
const settingItems = {
  hidePremiumEntry: storage.defineItem<unknown>('sync:settings:hidePremiumEntry'),
  hideShorts: storage.defineItem<unknown>('sync:settings:hideShorts'),
  hidePlayables: storage.defineItem<unknown>('sync:settings:hidePlayables'),
  hideMembership: storage.defineItem<unknown>('sync:settings:hideMembership'),
  blockUpsell: storage.defineItem<unknown>('sync:settings:blockUpsell'),
  blockAds: storage.defineItem<unknown>('sync:settings:blockAds'),
};

/** Stored value may predate a newly added key, so fill the gaps. */
export function withDefaults(value: unknown): Settings {
  const result = { ...DEFAULT_SETTINGS };
  if (typeof value !== 'object' || value === null) return result;
  for (const [name, field] of Object.entries(value)) {
    const key = SETTING_KEYS.find((key) => key === name);
    if (key !== undefined && typeof field === 'boolean') result[key] = field;
  }
  return result;
}

export async function getSettings(): Promise<Settings> {
  const [legacy, ...values]: { value: unknown }[] = await storage.getItems([
    legacySettingsItem, ...SETTING_KEYS.map((key) => settingItems[key]),
  ]);
  const result = withDefaults(legacy?.value);
  SETTING_KEYS.forEach((key, index) => {
    const value = values[index]?.value;
    if (typeof value === 'boolean') result[key] = value;
  });
  return result;
}

export async function setSetting(key: keyof Settings, checked: boolean): Promise<void> {
  await settingItems[key].setValue(checked);
}

/** Subscribe before reading; a newer change always supersedes an in-flight read. */
export function subscribeSettings(
  onSettings: (settings: Settings) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true;
  let revision = 0;
  const unwatch: (() => void)[] = [];
  const stop = () => {
    active = false;
    for (const remove of unwatch.splice(0)) {
      try { remove(); } catch (error) { onError(error); }
    }
  };
  const refresh = async () => {
    if (!active) return;
    const currentRevision = ++revision;
    try {
      const settings = await getSettings();
      if (active && currentRevision === revision) onSettings(settings);
    } catch (error) {
      if (active && currentRevision === revision) onError(error);
    }
  };
  try {
    for (const item of [legacySettingsItem, ...SETTING_KEYS.map((key) => settingItems[key])]) {
      unwatch.push(item.watch(() => { void refresh(); }));
    }
    void refresh();
  } catch (error) {
    stop();
    onError(error);
  }
  return stop;
}
