import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildFeatureCss } from './lib/youtube';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Firefox and Opera get a sources zip by default. Only an AMO review
  // submission needs it, so nothing builds it until one is due.
  zip: {
    zipSources: false,
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      for (const script of manifest.content_scripts ?? []) {
        if (script.js?.includes('content-scripts/content.js')) {
          script.css = [...(script.css ?? []), 'content-features.css'];
        }
      }
    },
    'build:done': async (wxt, output) => {
      await writeFile(resolve(wxt.config.outDir, 'content-features.css'), buildFeatureCss());
      output.publicAssets.push({ type: 'asset', fileName: 'content-features.css' });
    },
  },
  manifest: ({ browser, mode }) => ({
    name: 'Clean YouTube',
    description:
      'Blocks ads and hides Shorts and Premium promotions on YouTube and YouTube Music.',
    permissions: ['storage'],
    host_permissions: ['*://www.youtube.com/*', '*://music.youtube.com/*'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              // Temporary installs need a stable ID for storage.sync. AMO
              // continues to assign the production identity when signing.
              ...(mode === 'development' ? { id: 'clean-youtube-dev@kacigaya' } : {}),
              data_collection_permissions: {
                required: ['none'] as const,
              },
            },
          },
        }
      : {}),
  }),
});
