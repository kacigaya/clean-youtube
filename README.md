<p align="center">
  <img src="assets/logo.svg" alt="Clean YouTube logo" width="140">
</p>

<h1 align="center">Clean YouTube</h1>

<p align="center">
  <strong>Browser extension that cleans up desktop YouTube and YouTube Music.</strong><br>
  <em>Hide ads, Shorts discovery UI, memberships, and Premium promotions.</em>
</p>

<p align="center">
  <a href="https://wxt.dev"><img alt="WXT 0.21" src="https://shieldcn.dev/badge/WXT-0.21-8b5cf6.svg?variant=secondary&amp;logo=googlechrome"></a>
  <a href="https://react.dev"><img alt="React 19" src="https://shieldcn.dev/badge/React-19-61dafb.svg?variant=secondary&amp;logo=react&amp;logoColor=171717"></a>
  <a href="https://bun.sh"><img alt="Bun 1.3" src="https://shieldcn.dev/badge/Bun-1.3-fbf0df.svg?variant=secondary&amp;logo=bun&amp;logoColor=171717"></a>
  <a href="https://tailwindcss.com"><img alt="Tailwind CSS 4" src="https://shieldcn.dev/badge/Tailwind_CSS-4-06b6d4.svg?variant=secondary&amp;logo=tailwindcss"></a>
  <a href="https://github.com/kacigaya/clean-youtube/blob/main/LICENSE"><img alt="MIT License" src="https://shieldcn.dev/github/license/kacigaya/clean-youtube.svg?variant=secondary"></a>
</p>

## What it does

| Toggle                 | Effect                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------- |
| **Block ads**          | Mutes player ads and uses Skip controls; Music can seek past ads; hides feed and sidebar slots |
| **Hide Shorts**        | Hides Shorts navigation, shelves, cards and search results; direct `/shorts/` URLs work  |
| **Hide Playables**     | Hides the Playables games shelf in the feed and its sidebar entry                        |
| **Hide memberships**   | Hides channel Join buttons and dismisses membership offers through their Close control |
| **Hide Premium ads**   | Hides nonmodal YouTube Music promo bars and Premium-linked banners; dismisses Premium dialogs through their Close control |
| **Hide Premium entry** | Removes Premium links from YouTube and YouTube Music sidebars                            |

All six default to on and are toggled from the toolbar popup. Settings live in `sync` storage,
one key per toggle, and both the popup and content script react to changes without a reload.
Existing preferences remain readable from the previous `settings` object until that toggle is
changed. Changes made by this version are not written back to the old object, so downgrading
does not retain newly changed preferences.

Failed reads show a Retry action in the popup. Both the popup and content script retry after
1, 2, and 4 seconds, retaining their current settings. Successful reads and storage changes reset
the retry budget; closing the popup or invalidating the script cancels pending retries.
Failed saves leave the confirmed switch state intact.
Player and dialog actions wait for a successful initial read, including when that read needs a retry.

Feature rules are registered as native content CSS and enabled through attributes on the page's
root element. The browser removes that CSS on extension unload, including Firefox, where content
script callbacks may be destroyed before they can clean up a DOM-inserted stylesheet.
These rules require CSS nesting and `:has()` support; older browser versions are not tested.

Modal dismissal uses the page's native Close control so its focus and scroll state are released
by YouTube. A modal without a usable Close control remains visible. The extension does not remove
shared backdrops or document scroll locks.

The Premium sidebar entry is matched by a YouTube Premium route (`/premium`, `/musicpremium`,
`/paid_memberships`) **or** by its
icon path, so it is found in any interface language. The Playables shelf is matched by the
`ytd-mini-game-card-view-model` cards it contains rather than its heading, and Join buttons by their
`/channel/<id>/join` endpoint rather than their label, for the same reason.

## Develop

```bash
bun install
bun run dev          # Chrome; `bun run dev:firefox` for Firefox
bun test             # DOM logic, settings races, and lifecycle cleanup
bun run compile      # tsc --noEmit
bun run build        # .output/chrome-mv3
bun run build:firefox # .output/firefox-mv2
bun run lint:firefox  # requires the Firefox build
bunx --no-install playwright install chromium firefox
bun run test:browser # builds both browsers; fixtures and installed-extension tests
bun run test:live    # opt-in live YouTube/Music checks in anonymous test profiles
bun run profile:content # synthetic Chromium DOM-sweep benchmark
bun run zip          # packaged extension
bun run zip:firefox
```

## Layout

- `entrypoints/content.ts` registers the content script; `lib/content.ts` owns its lifecycle
- `lib/youtube.ts` holds the selectors and DOM logic (tested)
- `lib/settings.ts` holds the settings shape, defaults, and storage subscriptions
- `entrypoints/popup/` is the React popup
- `components/ui/` is the coss ui components
- `tests/` covers settings races, lifecycle cleanup, and DOM behavior
- `browser-tests/` checks the popup, CSS, native storage, and installed extensions in Chromium and Firefox

Use Bun 1.3.14. Firefox development builds have a stable temporary add-on ID for `storage.sync`;
production builds leave the identity to AMO signing. An unsigned production ZIP loaded temporarily
is not a substitute for the Firefox development build when testing synced preferences.

Deterministic browser tests serve fixtures on `127.0.0.1:4173` and intercept navigation to the
YouTube origins without contacting YouTube. They install the built extensions with their original
permissions and URL matches in disposable profiles. The temporary Firefox test copy receives an
ID for native `storage.sync`; production signing identity is unchanged.

Set `CHROMIUM_EXECUTABLE_PATH` to use an existing compatible Chromium binary.
`FIREFOX_EXECUTABLE_PATH` selects Firefox for installed-extension tests; Firefox fixture tests
use Playwright's bundled browser. The installed tests cover all six popup writes through native
storage, reflected changes, reloads, SPA mutations, native modal dismissal, focus restoration,
unrelated overlays, stylesheet removal on uninstall, and reinstallation.

`bun run test:live` contacts the real sites. It uses fresh anonymous profiles and rejects optional
cookies if a consent page appears. Consent, network, region, or application-rendering failures fail
the check and print diagnostics. Chromium runs headed because Music can reject its headless browser
identity; on Linux without a display, use `xvfb-run -a bun run test:live`. Firefox uses its native
headless BiDi endpoint. Live tests are excluded from normal CI; logged-in behavior,
actual ad breaks, and account-backed cross-device sync require separate verification.

Pull requests and releases run unit tests, type checks, Firefox build/lint, and both browser suites.
Release actions are pinned to commit hashes; package uploads follow all validation gates.

Mutation sweeps visit changed feature ancestors and added subtrees, merging overlapping work.
Player polling runs every 200 ms only while blocking is enabled and a player exists. Initial settings
and later preference changes still trigger a full reconciliation.

The synthetic profiler uses a 5,000-card feed and 20 unrelated text updates. On ARM64 Chromium
153.0.8010.12, the previous implementation ran 20 full sweeps with a median of 72.1 ms each and
9 player polling queries despite having no player. The scoped implementation ran zero sweeps and zero
player polling queries for the same updates, with 40 ID lookups to detect a player's presence.
These are local measurements, not live YouTube performance claims or CI timing thresholds.
Rerun `bun run profile:content` when changing mutation handling.

The lockfile includes targeted patch overrides for `brace-expansion`, `fast-uri`, `js-yaml`,
`nanoid`, and `undici` until their parent tools resolve the patched releases themselves.
Keep each override on its existing compatible version line; remove it once a regenerated
lockfile resolves a non-vulnerable version without it.

## Why ads are skipped, not pruned

The extension leaves player responses unchanged. It mutes a confirmed active player ad and clicks
an enabled, visible Skip control when available. An unskippable YouTube ad plays out muted. The cost is
roughly 200 ms of audible ad per break under normal foreground scheduling. Main-thread work and
browser timer throttling can delay the poll, so this is not an upper bound.

On `music.youtube.com`, an unskippable ad with a finite positive duration may be seeked to its end.
That requires the active ad marker, video, and controls to belong to the same player. Ordinary
content and leftover overlays do not qualify. The YouTube path never seeks.

Player containers remain visible; CSS hides feed and sidebar ad slots. This policy avoids altering
the player's layout or response data. It does not guarantee how YouTube's server-side enforcement
will behave. If Music seeking causes playback problems, disable the `seekPastAd` opt-in in
`lib/content.ts` and retain muting and native Skip controls.

## Limits

The extension hides display ads with CSS and skips player ads as they start. It does no
network-level blocking and no player-response rewriting. Site changes can still require selector
updates; passing fixture tests does not guarantee every live ad or promotion is handled.
