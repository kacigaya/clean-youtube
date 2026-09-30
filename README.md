<p align="center">
  <img src="assets/logo.svg" alt="Clean YouTube logo" width="140">
</p>

<h1 align="center">Clean YouTube</h1>

<p align="center">
  <strong>Browser extension that cleans up desktop YouTube and YouTube Music.</strong><br>
  <em>No ads, Shorts discovery UI, Premium ads, or Premium sidebar entry.</em>
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
| **Block ads**          | Clears player ads on Music, mutes them on YouTube; hides feed and sidebar ad slots       |
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

Failed reads show a Retry action in the popup; content scripts retain their current settings
and recover on the next storage update. Failed saves leave the confirmed switch state intact.

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
bunx --no-install playwright install chromium
bun run test:browser # builds Chrome and runs deterministic Chromium fixtures
bun run zip          # packaged extension
```

## Layout

- `entrypoints/content.ts` registers the content script; `lib/content.ts` owns its lifecycle
- `lib/youtube.ts` holds the selectors and DOM logic (tested)
- `lib/settings.ts` holds the settings shape, defaults, and storage subscriptions
- `entrypoints/popup/` is the React popup
- `components/ui/` is the coss ui components
- `tests/` covers settings races, lifecycle cleanup, and DOM behavior
- `browser-tests/` checks the popup, CSS, and isolated-world dismissal in Chromium

Use Bun 1.3.14. Firefox development builds have a stable temporary add-on ID for `storage.sync`;
production builds leave the identity to AMO signing. An unsigned production ZIP loaded temporarily
is not a substitute for the Firefox development build when testing synced preferences.

Browser tests serve fixtures on `127.0.0.1:4173` and do not contact YouTube. Set
`CHROMIUM_EXECUTABLE_PATH` to use an existing compatible Chromium binary. Pull requests run the
unit tests, type checks, Firefox build/lint, and Chromium tests, including the Chrome build.

The lockfile includes targeted patch overrides for `brace-expansion`, `fast-uri`, `js-yaml`,
`nanoid`, and `undici` until their parent tools resolve the patched releases themselves.
Keep each override on its existing compatible version line; remove it once a regenerated
lockfile resolves a non-vulnerable version without it.

## Why ads are skipped, not pruned

An earlier version removed `adPlacements` / `playerAds` / `adSlots` from player responses, the way
Brave and uBlock do. That is exactly what YouTube's enforcement looks for: the player notices the
ads it scheduled never played and raises the "ad blockers violate YouTube's Terms of Service" wall,
after which playback stops entirely. Suppressing the wall cosmetically only leaves a black player,
because the refusal has already happened server-side.

So the extension no longer touches player responses. It lets YouTube deliver the ad, mutes it, and
clicks "skip" once the button is offered. An unskippable ad plays out in full, muted. The cost is
roughly 200 ms of audible ad per break under normal foreground scheduling. Main-thread work and
browser timer throttling can delay the poll, so this is not an upper bound.

On youtube.com it also never moves the playback position. The player reports ad progress at each
quartile, so an ad seeked to its end reports as watched in ~0 ms, with every ping landing in the
same frame. YouTube flags that server-side and the wall follows, which is why an unskippable ad is
left to run there.

YouTube Music is the exception. It runs no comparable enforcement, so on `music.youtube.com` an
unskippable ad is seeked to its end and cleared outright instead of playing silent. That is a bet on
YouTube not extending the youtube.com enforcement to Music. If the wall ever shows up there, the fix
is to drop the `seekPastAd` flag in `entrypoints/content.ts` and take muted ads instead.

For the same reason, no CSS rule hides anything inside the player. YouTube measures its own ad
containers there and reads a zero-sized one as ad blocking, so `blockAds` covers feed and sidebar
containers only.

Anything else on the machine that prunes YouTube ads (Brave Shields, uBlock Origin, AdGuard) will
raise the wall on its own, and no change here can prevent that. Disable this extension and reload:
if the wall is still there, it is coming from the other blocker.

If the wall is already on screen from a previous session, it stays until YouTube clears the flag on
its side, usually after a reload or two with the blocking behaviour gone.

## Limits

The extension hides display ads with CSS and skips player ads as they start. It does no
network-level blocking and no player-response rewriting, which is what keeps playback working.
