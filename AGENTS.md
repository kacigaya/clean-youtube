# Project guidance

- Browser extension built with WXT, React, Tailwind, and Bun 1.3.14.
- Use `bun install --frozen-lockfile` after dependency changes have been resolved and saved.
- Validation: `bun test`, `bun run compile`, `bun run build:firefox`, `bun run lint:firefox`,
  and `bun run test:browser`. Browser tests build Chrome automatically.
- Browser setup: `bunx --no-install playwright install chromium`. An existing compatible browser
  can be selected with `CHROMIUM_EXECUTABLE_PATH`.
- Deterministic browser fixtures listen on `127.0.0.1:4173`; they do not contact YouTube.
- Chrome output is `.output/chrome-mv3`; Firefox output is `.output/firefox-mv2`.
- Packaging checks: `bun run zip` and `bun run zip:firefox`.
- Per-toggle sync keys override the read-only legacy `settings` object. Never migrate by writing
  a stale whole-object snapshot or overwriting preferences during startup.
- Dismiss modals through native page controls. Never remove shared backdrops or scroll locks.
- Tests must cover content-script invalidation and asynchronous storage failures or races.
- Pull-request validation uses Ubuntu 24.04. Release packaging uses Ubuntu 26.04 and uploads
  Chrome/Firefox ZIPs after a release is published. Do not manually trigger workflows.
