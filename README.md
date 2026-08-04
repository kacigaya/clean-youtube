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

- `entrypoints/adblock.content.ts` — removes ad metadata in the page's main JavaScript world
- `entrypoints/content.ts` — injects the stylesheet, sweeps the DOM on mutation, polls as fallback
- `lib/youtube.ts` — selectors, DOM logic and Brave-style player response pruning (tested)
- `lib/settings.ts` — settings shape, defaults, storage item
- `entrypoints/popup/` — React popup
- `components/ui/` — coss ui components

## Anti-adblock enforcement

Pruning ad metadata is exactly what YouTube looks for: the player sees the ads it scheduled never
played, resolves an `onAbnormalityDetected` continuation, and raises the "ad blockers violate
YouTube's Terms of Service" wall. Two things keep that from firing:

- `installAbnormalityBypass` proxies `Promise.prototype.then` and swaps any continuation whose
  source mentions `onAbnormalityDetected` for a no-op. Sources are read once per function and
  cached in a `WeakSet`, since every promise on the page passes through the proxy.
- The prune list covers the detection payloads too — `adBreakHeartbeatParams`,
  `responseContext.adSignalsInfo` and `auxiliaryUi.messageRenderers.upsellDialogRenderer` — on both
  the response and its nested `playerResponse`.

`ytd-enforcement-message-view-model` is hidden cosmetically as a backstop.

YouTube changes detection often, so this is a moving target. If the wall comes back, that bypass is
the first place to look.

## Limits

The extension removes ad and detection metadata from initial, parsed, fetch and XHR player
responses. DOM hiding and seeking remain as fallbacks. It does not block `googlevideo.com` media
requests, avoiding playback breakage from broad rules, and it does not touch the stall timers
YouTube uses to slow suspected blockers.
