# Project guidance

- Browser extension built with WXT, React, Tailwind, and Bun 1.3.14.
- Use `bun install --frozen-lockfile` after dependency changes have been resolved and saved.
- Validation: `bun test`, `bun run compile`, `bun run build:firefox`, `bun run lint:firefox`,
  and `bun run test:browser`. Browser tests build both Chrome and Firefox automatically.
- Browser setup: `bunx --no-install playwright install chromium firefox`. An existing compatible
  Chromium can be selected with `CHROMIUM_EXECUTABLE_PATH`; `FIREFOX_EXECUTABLE_PATH` selects
  Firefox for installed-extension tests. Firefox fixture tests use Playwright's bundled browser.
- Deterministic browser fixtures listen on `127.0.0.1:4173`; they do not contact YouTube.
- `bun run test:live` opts into real YouTube/Music smoke checks in disposable anonymous profiles.
  It rejects optional cookies on consent pages; it does not authenticate or verify actual ad breaks.
  Chromium runs headed; on headless Linux use `xvfb-run -a bun run test:live`. Firefox uses BiDi.
- `bun run profile:content` benchmarks 20 unrelated mutations on a synthetic 5,000-card Chromium
  feed. Keep timings out of CI assertions; use the result to justify changes to sweep scheduling.
- Chrome output is `.output/chrome-mv3`; Firefox output is `.output/firefox-mv2`.
- Packaging checks: `bun run zip` and `bun run zip:firefox`.
- Per-toggle sync keys override the read-only legacy `settings` object. Never migrate by writing
  a stale whole-object snapshot or overwriting preferences during startup.
- Dismiss modals through native page controls. Never remove shared backdrops or scroll locks.
- Register feature CSS through the browser's native content-script manifest. Gate rules with
  root attributes; Firefox unload can destroy callbacks before DOM styles are cleaned up.
- Settings read retries use 1, 2, and 4 seconds; cancel timers on unsubscribe/invalidation.
- Tests must cover content-script invalidation and asynchronous storage failures or races.
- Pull-request validation uses Ubuntu 24.04. Release packaging uses Ubuntu 26.04 and uploads
  Chrome/Firefox ZIPs after all unit, type, lint and browser gates pass for the published release.
  Pin Actions to commit hashes. Do not manually trigger workflows.
