import { afterEach, beforeEach, describe, expect, mock, spyOn, test, jest } from 'bun:test';
import { fakeBrowser } from '@webext-core/fake-browser';
import { DEFAULT_SETTINGS, getSettings, setSetting, subscribeSettings, withDefaults, type Settings } from '@/lib/settings';

const stops: (() => void)[] = [];
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

beforeEach(() => fakeBrowser.reset());
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  mock.restore();
  jest.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('settings storage', () => {
  test('validates booleans and preserves valid false values', () => {
    expect(withDefaults({ blockAds: false, hideShorts: null, blockUpsell: 'false' })).toEqual({
      ...DEFAULT_SETTINGS, blockAds: false,
    });
    expect(withDefaults(null)).toEqual(DEFAULT_SETTINGS);
  });

  test('reads legacy settings without rewriting them', async () => {
    await fakeBrowser.storage.sync.set({ settings: { blockAds: false, hideShorts: false } });
    expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS, blockAds: false, hideShorts: false });
    expect(await fakeBrowser.storage.sync.get<Record<string, unknown>>()).toEqual({ settings: { blockAds: false, hideShorts: false } });
  });

  test('independent concurrent writes preserve both preferences and legacy fallback', async () => {
    await fakeBrowser.storage.sync.set({ settings: { hidePlayables: false } });
    await Promise.all([setSetting('blockAds', false), setSetting('hideShorts', false)]);
    expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS, blockAds: false, hideShorts: false, hidePlayables: false });
    expect((await fakeBrowser.storage.sync.get<Record<string, unknown>>()).settings).toEqual({ hidePlayables: false });
  });

  test('new preference keys override legacy changes, including true values', async () => {
    await setSetting('blockAds', true);
    await fakeBrowser.storage.sync.set({ settings: { blockAds: false } });
    expect((await getSettings()).blockAds).toBe(true);
  });

  test('a change during the initial read supersedes its older result', async () => {
    const initial = deferred<Record<string, unknown>>();
    spyOn(fakeBrowser.storage.sync, 'get').mockImplementationOnce(() => initial.promise);
    const received: Settings[] = [];
    const errors: unknown[] = [];
    stops.push(subscribeSettings((value) => received.push(value), (error) => errors.push(error)));
    await setSetting('blockAds', false);
    await flush();
    initial.resolve({ settings: { blockAds: true } });
    await flush();
    expect(received).toHaveLength(1);
    expect(received[0]?.blockAds).toBe(false);
    expect(errors).toEqual([]);
  });

  test('unsubscription suppresses pending reads and later changes', async () => {
    const initial = deferred<Record<string, unknown>>();
    spyOn(fakeBrowser.storage.sync, 'get').mockImplementationOnce(() => initial.promise);
    const received = mock();
    const stop = subscribeSettings(received, mock());
    stop();
    initial.resolve({});
    await setSetting('hideShorts', false);
    await flush();
    expect(received).not.toHaveBeenCalled();
  });

  test('read errors are reported and subsequent storage updates recover', async () => {
    spyOn(fakeBrowser.storage.sync, 'get').mockImplementationOnce(async () => { throw new Error('read failed'); });
    const errors = mock();
    const received = mock();
    stops.push(subscribeSettings(received, errors));
    await flush();
    expect(errors).toHaveBeenCalledTimes(1);
    await setSetting('hideShorts', false);
    await flush();
    expect(received).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, hideShorts: false });
  });

  test('failed writes reject without changing stored values', async () => {
    const set = spyOn(fakeBrowser.storage.sync, 'set').mockImplementationOnce(async () => { throw new Error('write failed'); });
    await expect(setSetting('blockAds', false)).rejects.toThrow('write failed');
    set.mockRestore();
    expect((await getSettings()).blockAds).toBe(true);
  });

  test('transient failures recover automatically without storage changes', async () => {
    jest.useFakeTimers();
    await fakeBrowser.storage.sync.set({ settings: { blockAds: false } });
    spyOn(fakeBrowser.storage.sync, 'get').mockImplementationOnce(async () => { throw new Error('offline'); });
    const received = mock();
    stops.push(subscribeSettings(received, mock()));
    await flush();
    expect(received).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    await flush();
    expect(received).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, blockAds: false });
  });

  test('retries are bounded and unsubscription cancels pending recovery', async () => {
    jest.useFakeTimers();
    const get = spyOn(fakeBrowser.storage.sync, 'get').mockImplementation(async () => { throw new Error('offline'); });
    const stop = subscribeSettings(mock(), mock());
    stops.push(stop);
    await flush();
    for (const delay of [1000, 2000, 4000, 8000]) {
      jest.advanceTimersByTime(delay);
      await flush();
    }
    expect(get).toHaveBeenCalledTimes(4);
    await setSetting('hideShorts', false);
    await flush();
    expect(get).toHaveBeenCalledTimes(5);
    stop();
    jest.advanceTimersByTime(10000);
    await flush();
    expect(get).toHaveBeenCalledTimes(5);
  });

  test('a storage change cancels an older retry and restores the retry budget', async () => {
    jest.useFakeTimers();
    const get = spyOn(fakeBrowser.storage.sync, 'get').mockImplementationOnce(async () => { throw new Error('offline'); });
    const received = mock();
    stops.push(subscribeSettings(received, mock()));
    await flush();
    await setSetting('blockAds', false);
    await flush();
    jest.advanceTimersByTime(10000);
    await flush();
    expect(get).toHaveBeenCalledTimes(2);
    expect(received).toHaveBeenCalledTimes(1);
  });

  test('unsubscribing inside the error callback does not schedule a retry', async () => {
    jest.useFakeTimers();
    spyOn(fakeBrowser.storage.sync, 'get').mockImplementationOnce(async () => { throw new Error('offline'); });
    const schedule = spyOn(globalThis, 'setTimeout');
    let stop = () => {};
    stop = subscribeSettings(mock(), () => stop());
    stops.push(stop);
    await flush();
    expect(schedule).not.toHaveBeenCalled();
  });
});
