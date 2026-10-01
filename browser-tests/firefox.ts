import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { firefox } from '@playwright/test';

interface Reply {
  id?: number;
  type: string;
  result?: Record<string, unknown>;
  message?: string;
  method?: string;
  params?: Record<string, unknown>;
}

/** A loopback BiDi connection to an isolated Firefox test profile. */
export async function startFirefox(uuid: string, extensionId: string) {
  const profile = await mkdtemp(join(tmpdir(), 'clean-youtube-firefox-'));
  await writeFile(join(profile, 'user.js'), [
    `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ [extensionId]: uuid }))});`,
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
  ].join('\n'));
  const process = spawn(globalThis.process.env.FIREFOX_EXECUTABLE_PATH ?? firefox.executablePath(), [
    '--headless', '--no-remote', '--profile', profile, '--remote-allow-system-access', '--remote-debugging-port', '0', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let socket: WebSocket | undefined;
  let id = 0;
  const pending = new Map<number, { resolve: (result: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  const listeners = new Set<(message: Reply) => void>();
  const close = async () => {
    socket?.close();
    for (const call of pending.values()) call.reject(new Error('Firefox closed'));
    pending.clear();
    if (process.exitCode === null && process.signalCode === null) {
      process.kill();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => process.kill('SIGKILL'), 5000);
        process.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
    await rm(profile, { recursive: true, force: true });
  };
  try {
    const endpoint = await new Promise<string>((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Firefox BiDi startup timed out: ' + output)), 15000);
      process.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const match = output.match(/WebDriver BiDi listening on (ws:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1] + '/session'); }
      });
      process.once('error', (error) => { clearTimeout(timer); reject(error); });
      process.once('exit', () => { clearTimeout(timer); reject(new Error('Firefox exited: ' + output)); });
    });
    socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Firefox BiDi connection timed out')), 15000);
      socket!.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket!.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Firefox BiDi connection failed')); }, { once: true });
    });
    socket.addEventListener('message', (event) => {
      const message: Reply = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        const call = pending.get(message.id);
        pending.delete(message.id);
        if (message.type === 'error') call?.reject(new Error(message.message));
        else call?.resolve(message.result ?? {});
      } else for (const listener of listeners) listener(message);
    });
    socket.addEventListener('close', () => {
      for (const call of pending.values()) call.reject(new Error('Firefox BiDi disconnected'));
      pending.clear();
    });
    const send = (method: string, params: Record<string, unknown> = {}) => new Promise<Record<string, unknown>>((resolve, reject) => {
      const callId = ++id;
      const timer = setTimeout(() => { pending.delete(callId); reject(new Error(method + ' timed out')); }, 15000);
      pending.set(callId, {
        resolve: (result) => { clearTimeout(timer); resolve(result); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      socket!.send(JSON.stringify({ id: callId, method, params }));
    });
    await send('session.new', { capabilities: {} });
    return {
      send, close,
      onEvent: (listener: (message: Reply) => void) => { listeners.add(listener); },
      async createPage() {
        const reply = await send('browsingContext.create', { type: 'tab' });
        if (typeof reply.context !== 'string') throw new Error('Missing Firefox context');
        const context = reply.context;
        return {
          navigate: (url: string) => send('browsingContext.navigate', { context, url, wait: 'complete' }),
          reload: () => send('browsingContext.reload', { context, wait: 'complete' }),
          async evaluate(expression: string): Promise<unknown> {
            const reply = await send('script.evaluate', { target: { context }, expression: `(async () => JSON.stringify(await eval(${JSON.stringify(expression)})))()`, awaitPromise: true });
            if (reply.type !== 'success') throw new Error('Firefox evaluation failed: ' + JSON.stringify(reply));
            const result = reply.result;
            if (typeof result !== 'object' || result === null || !('value' in result)) return undefined;
            return typeof result.value === 'string' ? JSON.parse(result.value) : undefined;
          },
        };
      },
    };
  } catch (error) { await close(); throw error; }
}
