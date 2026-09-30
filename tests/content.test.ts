import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { fakeBrowser } from '@webext-core/fake-browser';
import { ContentScriptContext } from 'wxt/utils/content-script-context';
import { startContent } from '@/lib/content';
import { setSetting } from '@/lib/settings';

let ctx: ContentScriptContext;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
const OriginalMutationObserver = globalThis.MutationObserver;
let observer: MutationObserver | undefined;
let notify: MutationCallback;
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
async function sweep() {
  const records = observer?.takeRecords() ?? [];
  if (records.length && observer) notify(records, observer);
  await settle();
  const queued = [...frames.values()];
  frames.clear();
  for (const callback of queued) callback(0);
  await settle();
}

beforeEach(() => {
  fakeBrowser.reset();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  frames = new Map();
  nextFrame = 0;
  observer = undefined;
  globalThis.MutationObserver = class extends OriginalMutationObserver {
    constructor(callback: MutationCallback) {
      super(callback);
      observer = this;
      notify = callback;
    }
  };
  spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id); });
  spyOn(console, 'warn').mockImplementation(() => {});
  ctx = new ContentScriptContext('test-content');
});

afterEach(async () => {
  ctx.notifyInvalidated();
  await settle();
  mock.restore();
  globalThis.MutationObserver = OriginalMutationObserver;
});

test('invalidation cancels queued work, removes styles and unregisters storage listeners', async () => {
  const remove = spyOn(fakeBrowser.storage.sync.onChanged, 'removeListener');
  startContent(ctx);
  await settle();
  expect(frames.size).toBe(1);
  ctx.notifyInvalidated();
  expect(frames.size).toBe(0);
  expect(document.querySelector('style')).toBeNull();
  expect(remove).toHaveBeenCalledTimes(7);
  await setSetting('hideShorts', false);
  await sweep();
  expect(document.querySelector('style')).toBeNull();
});

test('a read completing after invalidation cannot reinstall resources', async () => {
  let resolve!: (value: Record<string, unknown>) => void;
  const pending = new Promise<Record<string, unknown>>((done) => { resolve = done; });
  spyOn(fakeBrowser.storage.sync, 'get').mockImplementationOnce(() => pending);
  startContent(ctx);
  ctx.notifyInvalidated();
  resolve({});
  await sweep();
  expect(document.querySelector('style')).toBeNull();
  expect(frames.size).toBe(0);
});

test('storage rejection retains defaults and cleanup remains available', async () => {
  spyOn(fakeBrowser.storage.sync, 'get').mockImplementationOnce(async () => { throw new Error('storage failed'); });
  startContent(ctx);
  await sweep();
  expect(console.warn).toHaveBeenCalledTimes(1);
  expect(document.querySelector('style')?.textContent).toContain('ytd-reel-shelf-renderer');
  ctx.notifyInvalidated();
  expect(document.querySelector('style')).toBeNull();
});

test('a delayed initial read cannot act before saved disabled preferences arrive', async () => {
  document.body.innerHTML = '<div id="movie_player" class="ad-showing"><video></video></div><ytd-popup-container><tp-yt-paper-dialog opened><a href="/premium">Premium</a><button dialog-dismiss>Close</button></tp-yt-paper-dialog></ytd-popup-container>';
  let resolve!: (value: Record<string, unknown>) => void;
  const pending = new Promise<Record<string, unknown>>((done) => { resolve = done; });
  spyOn(fakeBrowser.storage.sync, 'get').mockImplementationOnce(() => pending);
  let poll!: () => void;
  spyOn(ctx, 'setInterval').mockImplementation((callback) => { poll = callback; return 0; });
  const close = mock();
  document.querySelector('button')!.addEventListener('click', close);
  startContent(ctx);
  await sweep();
  poll();
  expect(close).not.toHaveBeenCalled();
  expect(document.querySelector('video')!.muted).toBe(false);
  resolve({ settings: { blockAds: false, blockUpsell: false, hideMembership: false } });
  await sweep();
  poll();
  expect(close).not.toHaveBeenCalled();
  expect(document.querySelector('video')!.muted).toBe(false);
});

test('opening an existing membership dialog through an attribute dismisses it', async () => {
  document.body.innerHTML = '<ytd-popup-container><tp-yt-paper-dialog><a href="/channel/abc/join?source=offer">Join</a><button dialog-dismiss>Close</button></tp-yt-paper-dialog></ytd-popup-container>';
  const dialog = document.querySelector('tp-yt-paper-dialog')!;
  const close = mock(() => dialog.removeAttribute('opened'));
  document.querySelector('button')!.addEventListener('click', close);
  startContent(ctx);
  await sweep();
  expect(close).not.toHaveBeenCalled();
  dialog.setAttribute('opened', '');
  await sweep();
  expect(close).toHaveBeenCalledTimes(1);
  expect(dialog.hasAttribute('opened')).toBe(false);
});

test('attribute changes remove stale Premium markers and disabling the feature clears them', async () => {
  document.body.innerHTML = '<ytd-guide-entry-renderer><a href="/premium">Premium</a></ytd-guide-entry-renderer>';
  startContent(ctx);
  await sweep();
  const entry = document.querySelector<HTMLElement>('ytd-guide-entry-renderer')!;
  expect(entry.dataset.cleanYoutubeHidden).toBe('1');
  document.querySelector('a')!.setAttribute('href', '/feed/library');
  await sweep();
  expect(entry.dataset.cleanYoutubeHidden).toBeUndefined();
  document.querySelector('a')!.setAttribute('href', '/premium');
  await sweep();
  await setSetting('hidePremiumEntry', false);
  await sweep();
  expect(entry.dataset.cleanYoutubeHidden).toBeUndefined();
});
