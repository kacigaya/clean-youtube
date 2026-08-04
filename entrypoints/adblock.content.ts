import { installPlayerAdBlocker } from '@/lib/youtube';

export default defineContentScript({
  matches: ['*://www.youtube.com/*', '*://music.youtube.com/*'],
  runAt: 'document_start',
  world: 'MAIN',

  main() {
    installPlayerAdBlocker(
      window as unknown as Parameters<typeof installPlayerAdBlocker>[0],
      () => document.documentElement.dataset.cleanYoutubeBlockAds !== '0',
    );
  },
});
