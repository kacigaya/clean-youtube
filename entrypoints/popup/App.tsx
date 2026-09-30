import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_SETTINGS, setSetting, subscribeSettings, type Settings } from '@/lib/settings';

const TOGGLES: { key: keyof Settings; title: string; description: string }[] = [
  {
    key: 'blockAds',
    title: 'Block ads',
    description: 'Mute and skip ads when available; hide ad slots.',
  },
  {
    key: 'hideShorts',
    title: 'Hide Shorts',
    description: 'Hide Shorts from feeds, search and navigation.',
  },
  {
    key: 'hidePlayables',
    title: 'Hide Playables',
    description: 'Hide the games shelf and its sidebar link.',
  },
  {
    key: 'hideMembership',
    title: 'Hide memberships',
    description: 'Hide channel Join buttons and membership offers.',
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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<keyof Settings | null>(null);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(false);
  const saving = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeSettings((value) => {
      setSettings(value);
      setLoaded(true);
      setError(null);
    }, () => {
      setLoaded(false);
      setError('Could not load settings. Try again.');
    });
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [attempt]);

  const toggle = async (key: keyof Settings, checked: boolean) => {
    if (saving.current) return;
    saving.current = true;
    setPending(key);
    setError(null);
    try {
      await setSetting(key, checked);
      if (mounted.current) setAttempt((value) => value + 1);
    } catch {
      if (mounted.current) setError('Could not save this setting. Try again.');
    } finally {
      saving.current = false;
      if (mounted.current) setPending(null);
    }
  };

  return (
    <main className="flex flex-col" aria-busy={!loaded && !error}>
      <header className="flex flex-col gap-1 px-4 py-3">
        <h1 className="font-semibold text-base leading-none">Clean YouTube</h1>
        <p className="text-muted-foreground text-xs">
          Keeps YouTube and YouTube Music clean.
        </p>
      </header>
      <Separator />
      {error && (
        <div className="flex flex-col gap-2 border-b px-4 py-3 text-sm">
          <p role="alert">{error}</p>
          <button
            type="button"
            className="self-start rounded border px-2 py-1 focus-visible:outline-2 focus-visible:outline-offset-2"
            disabled={pending !== null}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}
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
                disabled={!loaded || pending !== null}
                onCheckedChange={(checked) => { void toggle(key, checked); }}
              />
            </Label>
          </div>
        ))}
      </div>
    </main>
  );
}

export default App;
