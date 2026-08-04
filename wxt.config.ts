import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Clean YouTube',
    description:
      'Blocks ads and hides Shorts and Premium promotions on YouTube and YouTube Music.',
    permissions: ['storage'],
    host_permissions: ['*://www.youtube.com/*', '*://music.youtube.com/*'],
  },
});
