# Player.pl remote — TizenBrew site mod

Opens Player's own website (`https://player.pl/`) on a Samsung Tizen TV through
[TizenBrew](https://github.com/reisxd/TizenBrew) and makes it usable with the TV remote.

**Why a site mod and not an app:** Player has no Tizen app for 2025 TVs, and its video is
DRM-protected. This mod doesn't touch playback or DRM. It adds remote-control navigation on top of
Player's official web client, so whether video plays is decided by Player's servers, exactly as in
a browser.

**Why it reports desktop Chrome:** player.pl shows "watch in the app" to any browser whose user
agent names a TV (`TIZEN`, `SMART-TV`). The check runs in the page, not on the server. The mod
reports the TV's real Chromium version as Chrome on Windows. It says Windows rather than Linux
because Player's config (`playerapi/info`) requires Chrome 127+ on Linux and 110+ elsewhere, and
2025 TVs run Chromium 120.

Player reads the user agent once, when its script runs, and TizenBrew injects the mod a moment
after the page starts. The mod usually gets there first. When it doesn't, Player shows its block
screen and the mod reloads the page, at most 3 times a minute. TizenBrew's
`evaluateScriptOnDocumentStart` option would avoid this race, but TizenBrew never launches modules
that set it: it waits for a page event that doesn't come.

**Why it hides TVN's "unsupported browser" overlay:** logging in happens on `account.tvn.pl`, which
parses the user agent with platform.js in an inline `<head>` script. That always runs before
TizenBrew injects the mod, reads the TV's user agent as Safari 7, and covers the login form with
"Nieobsługiwana przeglądarka". The engine is Chromium 120, above the gate's own Chrome 93 minimum,
so the mod hides the overlay there; the form underneath works.

## What the remote does

| Key | Browsing | Watching (video covers ≥ 60% of the screen) |
|---|---|---|
| Arrows | Move the yellow focus ring to the nearest item in that direction; scroll when nothing is there | Left/Right seek ±10 s (unless a player control is focused); Up/Down move focus |
| Enter / OK | Open the focused item; on the search box, open the on-screen keyboard | Play/pause (unless a player control is focused) |
| Back | Close the keyboard, otherwise go to the previous page | Leave fullscreen |
| Play/Pause, Play, Pause, Stop, ⏩, ⏪ | — | Control the video |

On a show or episode page, the main button ("Oglądaj", or "Zaloguj się, by oglądać" when logged
out) gets focus as soon as it appears, unless you've already pressed a key. OK on "Oglądaj" plays
the video fullscreen. Player's own fullscreen button only appears when a mouse moves, so the remote
can't reach it. The player's box goes fullscreen as soon as Player creates it, before the video
starts. The browser allows fullscreen only for about 5 seconds after a key press, so if the TV is
slower than that, the mod keeps the request and completes it on your next key press. Leaving the page
or pressing Back cancels the request. In fullscreen, arrows,
OK and Back act on the video, as in the table's right column. For 3 seconds after
each page load, the top-right corner shows the mod's version, so you can tell which TizenBrew
module is running.

## Install

1. Turn on Developer Mode on the TV with your computer's IP address as Host PC IP, and install
   TizenBrew, for example with [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung).
2. Change Host PC IP to `127.0.0.1` and restart the TV by holding the remote's power button until
   the Samsung logo appears. TizenBrew drives the TV's own debugger, so it needs this.
3. In TizenBrew's module manager, choose **Add GitHub module** and enter
   `torztomasz/player-pl-remote@v0.7.1`.
4. Go back to TizenBrew's home screen and launch **Player.pl**. Selecting a module inside the
   module manager offers to remove it instead.

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
  browser at TV resolution: header, rows, cards, search box, cookie banner, opening a show, and
  reaching the e-mail login form on account.tvn.pl.
  Playback and the video keys still need testing on the S90F.
- **Player may require Chrome 127+ on Linux for a reason.** If playback misbehaves on the TV, that
  stricter Linux requirement may be why.
- **Playback depends on Player.** If Player's web player refuses the TV's browser engine, video
  won't play, and this mod can't change that.
- **Cross-origin iframes are unreachable.** Remote navigation can't enter them. Player's own
  video player and dialogs render in the main page, so this doesn't affect the main flows.
- **The layout is Player's desktop site.** Text is small from a sofa, and Player can change its
  markup at any time. Navigation targets standard links and buttons rather than Player's class
  names, so it should survive most redesigns. Only the default focus on the main button relies on
  Player's `detail__buttons` class; if that changes, the button simply won't get focus first.
