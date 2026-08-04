<p align="center">
  <img src="assets/logo.svg" alt="Logo" width="200">
</p>

<h1 align="center">Clean YouTube</h1>

<p align="center">
   <strong>Browser extension that cleans up desktop YouTube and YouTube Music: no ads, Shorts discovery UI,
   Premium ads, or Premium sidebar entry.</strong><br>
   <em>Built with [WXT](https://wxt.dev) + React, UI from
  [coss ui](https://coss.com/ui).</em>
</p>

## What it does

| Toggle                 | Effect                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------- |
| **Block ads**          | Removes player ad metadata before playback, with DOM hiding and seeking as fallbacks     |
| **Hide Shorts**        | Hides Shorts navigation, shelves, cards and search results; direct `/shorts/` URLs work  |
| **Hide Premium ads**   | Hides Premium-linked promos and banners, and closes Premium dialogs and their backdrop   |
| **Hide Premium entry** | Removes Premium links from YouTube and YouTube Music sidebars                            |

All four default to on and are toggled from the toolbar popup. Settings live in `sync` storage,
and the content script reacts to changes without a page reload.

The Premium sidebar entry is matched by its link (`*premium*`, `*paid_memberships*`) **or** by its
icon path, so it is found in any interface language.

## Develop

```bash
bun install
bun run dev          # Chrome; `bun run dev:firefox` for Firefox
bun test             # DOM logic in lib/youtube.ts
bun run compile      # tsc --noEmit
bun run build        # .output/chrome-mv3
bun run zip          # packaged extension
```

## Layout

- `entrypoints/content.ts` — injects the stylesheet, sweeps the DOM on mutation, polls for ads
- `lib/youtube.ts` — selectors and DOM logic (tested)
- `lib/settings.ts` — settings shape, defaults, storage item
- `entrypoints/popup/` — React popup
- `components/ui/` — coss ui components

## Why ads are skipped, not pruned

An earlier version removed `adPlacements` / `playerAds` / `adSlots` from player responses, the way
Brave and uBlock do. That is exactly what YouTube's enforcement looks for: the player notices the
ads it scheduled never played and raises the "ad blockers violate YouTube's Terms of Service" wall,
after which playback stops entirely. Suppressing the wall cosmetically only leaves a black player —
the refusal has already happened server-side.

So the extension no longer touches player responses. It lets YouTube deliver the ad, then mutes it,
clicks "skip" if offered, and otherwise seeks to its end. YouTube sees an ad that played, so nothing
triggers enforcement. The cost is up to ~200 ms of muted ad per break, bounded by the poll interval
in `entrypoints/content.ts`.

For the same reason, no CSS rule hides anything inside the player. YouTube measures its own ad
containers there and reads a zero-sized one as ad blocking, so `blockAds` covers feed and sidebar
containers only.

Anything else on the machine that prunes YouTube ads — Brave Shields, uBlock Origin, AdGuard — will
raise the wall on its own, and no change here can prevent that. Disable this extension and reload:
if the wall is still there, it is coming from the other blocker.

If the wall is already on screen from a previous session, it stays until YouTube clears the flag on
its side — usually after a reload or two with the blocking behaviour gone.

## Limits

Display ads are hidden with CSS and player ads are skipped as they start. There is no network-level
blocking and no player-response rewriting, which is what keeps playback working.
