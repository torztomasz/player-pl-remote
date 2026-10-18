# Player.pl remote — TizenBrew site mod

Opens Player's own website (`https://player.pl/`) on a Samsung Tizen TV through
[TizenBrew](https://github.com/reisxd/TizenBrew) and makes it usable with the TV remote.

**Why a site mod and not an app:** Player has no Tizen app for 2025 TVs, and its video is
DRM-protected. This mod doesn't touch playback or DRM. It only adds remote-control navigation on
top of Player's official web client, so whether video plays is decided by Player's servers,
exactly as in a browser.

## What the remote does

| Key | Browsing | Watching (video covers ≥ 60% of the screen) |
|---|---|---|
| Arrows | Move the yellow focus ring to the nearest item in that direction; scroll when nothing is there | Left/Right seek ±10 s (unless a player control is focused); Up/Down move focus |
| Enter / OK | Open the focused item; on the search box, open the on-screen keyboard | Play/pause (unless a player control is focused) |
| Back | Close the keyboard, otherwise go to the previous page | Leave fullscreen |
| Play/Pause, Play, Pause, Stop, ⏩, ⏪ | — | Control the video |

## Install

1. Turn on Developer Mode on the TV and point it at your computer's IP address.
2. Install TizenBrew, for example with [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung).
3. In TizenBrew, open the module manager, add `gh/torztomasz/player-pl-remote@v0.1.0`, and
   launch **Player.pl**.

TizenBrew downloads modules through jsDelivr (`https://cdn.jsdelivr.net/gh/<user>/<repo>@<tag>/…`),
so a fork must be public to work. jsDelivr caches what it serves, so pin a release tag: each new
tag reaches the TV right away, while pushes to a branch can take hours.

## Develop

```bash
npm test   # spatial-navigation unit tests, Node 18+
```

`src/userScript.js` is the whole mod: TizenBrew injects it into every page load of player.pl.
It runs only in the top frame, because TizenBrew also injects into ad and tracking iframes.

## Known limits

- **Not yet tested on a TV.** Navigation was checked against the live player.pl in a desktop
  browser at TV resolution: header, rows, cards, search box, cookie banner, and opening a show.
  Playback and the video keys still need testing on the S90F.
- **Playback depends on Player.** If Player's web player refuses the TV's browser engine, video
  won't play, and this mod can't change that.
- **Cross-origin iframes are unreachable.** Remote navigation can't enter them. Player's own
  video player and dialogs render in the main page, so this doesn't affect the main flows.
- **The layout is Player's desktop site.** Text is small from a sofa, and Player can change its
  markup at any time. The mod targets standard links and buttons rather than Player's class
  names, so it should survive most redesigns.
