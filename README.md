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
| **Block ads**          | Clears player ads on Music, mutes them on YouTube; hides feed and sidebar ad slots       |
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

- `entrypoints/content.ts` injects the stylesheet, sweeps the DOM on mutation, and polls for ads
- `lib/youtube.ts` holds the selectors and DOM logic (tested)
- `lib/settings.ts` holds the settings shape, defaults, and storage item
- `entrypoints/popup/` is the React popup
- `components/ui/` is the coss ui components

## Why ads are skipped, not pruned

An earlier version removed `adPlacements` / `playerAds` / `adSlots` from player responses, the way
Brave and uBlock do. That is exactly what YouTube's enforcement looks for: the player notices the
ads it scheduled never played and raises the "ad blockers violate YouTube's Terms of Service" wall,
after which playback stops entirely. Suppressing the wall cosmetically only leaves a black player,
because the refusal has already happened server-side.

So the extension no longer touches player responses. It lets YouTube deliver the ad, mutes it, and
clicks "skip" once the button is offered. An unskippable ad plays out in full, muted. The cost is
up to ~200 ms of audible ad per break, bounded by the poll interval in `entrypoints/content.ts`.

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
