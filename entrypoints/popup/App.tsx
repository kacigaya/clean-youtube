import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_SETTINGS, getSettings, settingsItem, type Settings } from '@/lib/settings';

const TOGGLES: { key: keyof Settings; title: string; description: string }[] = [
  {
    key: 'blockAds',
    title: 'Block ads',
    description: 'Prevent player ads and hide remaining ad slots.',
  },
  {
    key: 'hideShorts',
    title: 'Hide Shorts',
    description: 'Hide Shorts from feeds, search and navigation.',
  },
  {
    key: 'blockUpsell',
    title: 'Hide Premium ads',
    description: 'Dismiss Premium promos, banners and dialogs.',
  },
  {
    key: 'hidePremiumEntry',
    title: 'Hide Premium entry',
    description: 'Remove the Premium link from the sidebar.',
  },
];

function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSettings().then((value) => {
      setSettings(value);
      setLoaded(true);
    });
  }, []);

  const toggle = (key: keyof Settings, checked: boolean) => {
    const next = { ...settings, [key]: checked };
    setSettings(next);
    settingsItem.setValue(next);
  };

  return (
    <main className="flex flex-col">
      <header className="flex flex-col gap-1 px-4 py-3">
        <h1 className="font-heading font-semibold text-base leading-none">Clean YouTube</h1>
        <p className="text-muted-foreground text-xs">
          Keeps YouTube and YouTube Music clean.
        </p>
      </header>
      <Separator />
      <div className="flex flex-col px-4">
        {TOGGLES.map(({ key, title, description }, index) => (
          <div key={key}>
            {index > 0 && <Separator />}
            <Label className="w-full items-start justify-between gap-3 py-3 text-sm/4">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span>{title}</span>
                <span className="font-normal text-muted-foreground text-xs">{description}</span>
              </span>
              <Switch
                checked={settings[key]}
                disabled={!loaded}
                onCheckedChange={(checked) => toggle(key, checked)}
              />
            </Label>
          </div>
        ))}
      </div>
    </main>
  );
}

export default App;
