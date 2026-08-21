import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

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
  manifest: ({ browser }) => ({
    name: 'Clean YouTube',
    description:
      'Blocks ads and hides Shorts and Premium promotions on YouTube and YouTube Music.',
    permissions: ['storage'],
    host_permissions: ['*://www.youtube.com/*', '*://music.youtube.com/*'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              data_collection_permissions: {
                required: ['none'] as const,
              },
            },
          },
        }
      : {}),
  }),
});
