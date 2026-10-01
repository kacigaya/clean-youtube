import { afterEach, beforeEach, expect, mock, spyOn, test, jest } from 'bun:test';
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
  jest.useRealTimers();
  globalThis.MutationObserver = OriginalMutationObserver;
});

test('invalidation cancels queued work, clears feature attributes and unregisters storage listeners', async () => {
  const remove = spyOn(fakeBrowser.storage.sync.onChanged, 'removeListener');
  startContent(ctx);
  await settle();
  expect(frames.size).toBe(1);
  ctx.notifyInvalidated();
  expect(frames.size).toBe(0);
  expect(document.documentElement.hasAttribute('data-clean-youtube-hideshorts')).toBe(false);
  expect(remove).toHaveBeenCalledTimes(7);
  await setSetting('hideShorts', false);
  await sweep();
  expect(document.documentElement.hasAttribute('data-clean-youtube-hideshorts')).toBe(false);
});

test('a read completing after invalidation cannot reinstall resources', async () => {
  let resolve!: (value: Record<string, unknown>) => void;
  const pending = new Promise<Record<string, unknown>>((done) => { resolve = done; });
  spyOn(fakeBrowser.storage.sync, 'get').mockImplementationOnce(() => pending);
  startContent(ctx);
  ctx.notifyInvalidated();
  resolve({});
  await sweep();
  expect(document.documentElement.hasAttribute('data-clean-youtube-hideshorts')).toBe(false);
  expect(frames.size).toBe(0);
});

test('storage rejection retains defaults and cleanup remains available', async () => {
  spyOn(fakeBrowser.storage.sync, 'get').mockImplementationOnce(async () => { throw new Error('storage failed'); });
  startContent(ctx);
  await sweep();
  expect(console.warn).toHaveBeenCalledTimes(1);
  expect(document.documentElement.hasAttribute('data-clean-youtube-hideshorts')).toBe(true);
  ctx.notifyInvalidated();
  expect(document.documentElement.hasAttribute('data-clean-youtube-hideshorts')).toBe(false);
});

test('a delayed initial read cannot act before saved disabled preferences arrive', async () => {
  document.body.innerHTML = '<div id="movie_player" class="ad-showing"><video></video></div><ytd-popup-container><tp-yt-paper-dialog opened><a href="/premium">Premium</a><button dialog-dismiss>Close</button></tp-yt-paper-dialog></ytd-popup-container>';
  let resolve!: (value: Record<string, unknown>) => void;
  const pending = new Promise<Record<string, unknown>>((done) => { resolve = done; });
  spyOn(fakeBrowser.storage.sync, 'get').mockImplementationOnce(() => pending);
  const poll = spyOn(globalThis, 'setInterval');
  const close = mock();
  document.querySelector('button')!.addEventListener('click', close);
  startContent(ctx);
  await sweep();
  expect(poll).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(document.querySelector('video')!.muted).toBe(false);
  resolve({ settings: { blockAds: false, blockUpsell: false, hideMembership: false } });
  await sweep();
  expect(poll).not.toHaveBeenCalled();
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

test('unrelated text changes avoid document scans while inserted entries are classified', async () => {
  document.body.innerHTML = '<main><div id="status"></div></main>';
  startContent(ctx);
  await sweep();
  const query = spyOn(document, 'querySelectorAll');
  document.querySelector('#status')!.textContent = 'Updated';
  await sweep();
  expect(query).not.toHaveBeenCalled();
  const entry = document.createElement('ytd-guide-entry-renderer');
  entry.innerHTML = '<a href="/premium">Premium</a>';
  document.querySelector('main')!.append(entry);
  await sweep();
  expect(entry.dataset.cleanYoutubeHidden).toBe('1');
  expect(query).not.toHaveBeenCalled();
  entry.querySelector('a')!.remove();
  await sweep();
  expect(entry.dataset.cleanYoutubeHidden).toBeUndefined();
});

test('player polling starts on insertion and stops on removal, disabling and invalidation', async () => {
  jest.useFakeTimers();
  const interval = spyOn(globalThis, 'setInterval');
  const clear = spyOn(globalThis, 'clearInterval');
  startContent(ctx);
  await sweep();
  expect(interval).not.toHaveBeenCalled();
  const player = document.createElement('div');
  player.id = 'movie_player';
  player.className = 'ad-showing';
  player.innerHTML = '<video></video>';
  document.body.append(player);
  await sweep();
  expect(interval).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(200);
  expect(player.querySelector('video')!.muted).toBe(true);
  player.remove();
  await sweep();
  expect(clear).toHaveBeenCalledTimes(1);
  expect(player.querySelector('video')!.muted).toBe(false);
  document.body.append(player);
  await sweep();
  await setSetting('blockAds', false);
  await sweep();
  expect(clear).toHaveBeenCalledTimes(2);
  await setSetting('blockAds', true);
  await sweep();
  ctx.notifyInvalidated();
  expect(clear).toHaveBeenCalledTimes(3);
});

test('an initial read failure keeps player and dialog actions gated until retry succeeds', async () => {
  jest.useFakeTimers();
  await fakeBrowser.storage.sync.set({ settings: { blockAds: false, blockUpsell: false, hideMembership: false } });
  spyOn(fakeBrowser.storage.sync, 'get').mockImplementationOnce(async () => { throw new Error('offline'); });
  document.body.innerHTML = '<div id="movie_player" class="ad-showing"><video></video></div><ytd-popup-container><tp-yt-paper-dialog opened><a href="/premium">Offer</a><button dialog-dismiss>Close</button></tp-yt-paper-dialog></ytd-popup-container>';
  const close = mock();
  document.querySelector('button')!.addEventListener('click', close);
  const interval = spyOn(globalThis, 'setInterval');
  startContent(ctx);
  await sweep();
  expect(interval).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1000);
  await sweep();
  expect(interval).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(document.documentElement.hasAttribute('data-clean-youtube-blockads')).toBe(false);
});
