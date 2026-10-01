import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser-tests',
  testMatch: '**/*.pw.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
  webServer: {
    command: 'bun run build && bun run build:firefox && bun build browser-tests/fixture.ts --outdir .output/test-fixture --target browser && bun browser-tests/server.ts',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
