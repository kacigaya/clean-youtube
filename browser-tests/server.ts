const root = new URL('../.output/chrome-mv3/', import.meta.url).pathname;
Bun.serve({
  hostname: '127.0.0.1',
  port: 4173,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const file = Bun.file(root + (path === '/' ? 'popup.html' : path.slice(1)));
    return await file.exists() ? new Response(file) : new Response(null, { status: 404 });
  },
});
