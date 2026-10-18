// TizenBrew site mod: makes Player's own website (player.pl) usable with a Samsung TV remote.
// It adds focus navigation and key handling and presents the TV's browser as desktop Chrome;
// playback and DRM are left to Player's web player.
(function (root) {
  'use strict';

  const VERSION = '0.7.1';
  const KEY = {
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40,
    ENTER: 13,
    BACK: 10009,
    PLAY_PAUSE: 10252,
    PLAY: 415,
    PAUSE: 19,
    STOP: 413,
    FAST_FORWARD: 417,
    REWIND: 412,
  };
  const ARROW_DIRECTIONS = {
    [KEY.LEFT]: 'left',
    [KEY.UP]: 'up',
    [KEY.RIGHT]: 'right',
    [KEY.DOWN]: 'down',
  };
  const SEEK_SECONDS = 10;
  // A video covering this much of the screen means the user is watching, so keys control playback.
  const WATCHING_SCREEN_SHARE = 0.6;
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[tabindex]',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="option"]',
  ].join(',');
  const FOCUS_MARKER = 'data-remote-focus';
  // Player's "Oglądaj"; the class name is the only stable handle on it.
  const WATCH_BUTTON = 'button[class*="detail__button--in-player"]';
  // The box Player's own fullscreen button puts on screen (its web player's root element).
  const PLAYER_BOX = '#player-holder [id^="container_"]';

  if (typeof module === 'object' && module.exports) {
    module.exports = { pickNext, desktopUserAgent, opacityOf, VERSION };
    return;
  }
  presentAsDesktopChrome();
  // TizenBrew evaluates the mod in every execution context: ad and tracking iframes, and isolated
  // worlds beside the page. Each world has its own `window` but shares the DOM, so the run-once
  // mark lives on the DOM: one key handler per page, or one press moves focus several times.
  const RUNNING_MARKER = 'data-player-pl-remote';
  // Set by OK on "Oglądaj" until its video plays fullscreen; see watchFullscreen.
  let fullscreenWish = null;
  if (root.top !== root || document.documentElement.hasAttribute(RUNNING_MARKER)) return;
  document.documentElement.setAttribute(RUNNING_MARKER, '');
  main();

  function main() {
    reloadIfBlocked();
    // Capture phase, so the site's own key handlers can't swallow remote keys first.
    root.addEventListener('keydown', handleKey, true);
    // TizenBrew may inject the mod before <head> exists.
    whenDocumentReady(injectFocusStyle);
    whenDocumentReady(showVersion);
    if (root.location.hostname === 'account.tvn.pl') whenDocumentReady(hideTvnBrowserGate);
    else focusMainButtonOnEachPage();
  }

  function whenDocumentReady(callback) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback);
    else callback();
  }

  // Player's site shows "watch in the app" to any user agent naming a TV (TIZEN, SMART-TV). The
  // check runs in the page, not on the server, and the TV's engine is Chromium anyway.
  function presentAsDesktopChrome() {
    const userAgent = desktopUserAgent(root.navigator.userAgent);
    Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => userAgent, configurable: true });
  }

  // Player reads the user agent once, when its script runs. TizenBrew injects the mod as soon as
  // the page's script context exists, which normally comes first; if Player won the race, it shows
  // a block screen, and a reload gives the override another try. (TizenBrew's document-start
  // option would avoid the race, but TizenBrew never launches modules that use it.)
  function reloadIfBlocked() {
    const BLOCK_TEXT = /uruchom aplikację player|ZMIEŃ PRZEGLĄDARKĘ/i;
    const RETRIES_KEY = 'playerPlRemoteRetries';
    // Capped, so a block the override can't fix doesn't become a reload loop.
    const MAX_RETRIES = 3;
    const RETRY_WINDOW_MS = 60000;
    const WATCH_MS = 15000;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > WATCH_MS) clearInterval(timer);
      if (!document.body || !BLOCK_TEXT.test(document.body.textContent)) return;
      clearInterval(timer);
      const recent = JSON.parse(sessionStorage.getItem(RETRIES_KEY) || '[]').filter((at) => Date.now() - at < RETRY_WINDOW_MS);
      if (recent.length >= MAX_RETRIES) return;
      sessionStorage.setItem(RETRIES_KEY, JSON.stringify([...recent, Date.now()]));
      root.location.reload();
    }, 500);
  }

  // Keeps the engine's real Chromium version, so feature checks match what the TV can do. Claims
  // Windows because Player's config (playerapi/info) wants Chrome 127+ on Linux but 110+ elsewhere,
  // and the 2025 TVs run Chromium 120.
  function desktopUserAgent(tvUserAgent) {
    const chromeMajor = (tvUserAgent.match(/\b(\d{2,3})\.\d+\.\d+\.\d+\b/) || [])[1] || '120';
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
  }

  function handleKey(event) {
    const video = watchedVideo();
    const handled =
      exitFullscreenOnBack(event.keyCode) ||
      (video && handleVideoKey(event.keyCode, video)) ||
      handleNavigationKey(event.keyCode);
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  // Even between an ad and the episode, when no video is ready: Back must not leave the page.
  function exitFullscreenOnBack(keyCode) {
    if (keyCode !== KEY.BACK || !document.fullscreenElement) return false;
    fullscreenWish = null;
    document.exitFullscreen();
    return true;
  }

  function handleVideoKey(keyCode, video) {
    const controlFocused = focusedElement() !== null;
    switch (keyCode) {
      case KEY.PLAY_PAUSE:
        return togglePlayback(video);
      case KEY.ENTER:
        return controlFocused ? false : togglePlayback(video);
      case KEY.PLAY:
        video.play();
        return true;
      case KEY.PAUSE:
      case KEY.STOP:
        video.pause();
        return true;
      case KEY.FAST_FORWARD:
        return seekBy(video, SEEK_SECONDS);
      case KEY.REWIND:
        return seekBy(video, -SEEK_SECONDS);
      case KEY.RIGHT:
        return controlFocused ? false : seekBy(video, SEEK_SECONDS);
      case KEY.LEFT:
        return controlFocused ? false : seekBy(video, -SEEK_SECONDS);
      default:
        return false;
    }
  }

  function handleNavigationKey(keyCode) {
    const direction = ARROW_DIRECTIONS[keyCode];
    const current = focusedElement();
    if (direction) {
      if (current && isEditing(current) && caretCanMove(current, direction)) return false;
      if (current && isEditing(current)) current.blur();
      moveFocus(current, direction);
      return true;
    }
    if (keyCode === KEY.ENTER) return current ? activate(current) : false;
    if (keyCode === KEY.BACK) return goBack(current);
    return false;
  }

  // Scrolls when nothing lies ahead, so rows further down can lazy-load and become reachable.
  function moveFocus(current, direction) {
    const candidates = focusableCandidates().filter((element) => element !== current);
    if (!current) {
      focusElement(nearestTopLeft(candidates));
      return;
    }
    const next = pickNext(
      current.getBoundingClientRect(),
      candidates.map((element) => ({ item: element, rect: element.getBoundingClientRect() })),
      direction,
    );
    if (next) focusElement(next);
    else scrollPage(direction);
  }

  /**
   * Picks the candidate a remote user expects to land on when pressing `direction` from `from`.
   * Candidates must lie beyond `from` in that direction. Anything still in the current row or
   * column beats anything outside it; within each group, nearer wins, and distance across the
   * direction costs more than distance along it.
   */
  function pickNext(from, candidates, direction) {
    const ACROSS_WEIGHT = 3;
    const OTHER_ROW_PENALTY = 1e6;
    let best = null;
    let bestScore = Infinity;
    for (const candidate of candidates) {
      const along = distanceAlong(from, candidate.rect, direction);
      if (along === null) continue;
      const across = distanceAcross(from, candidate.rect, direction);
      const score = along + ACROSS_WEIGHT * across + (across > 0 ? OTHER_ROW_PENALTY : 0);
      if (score < bestScore) {
        best = candidate.item;
        bestScore = score;
      }
    }
    return best;
  }

  // Gap between the edges in `direction`, or null when `to` doesn't lie ahead of `from`. Ahead
  // means its center lies further that way by a real margin: a tile below a button that starts at
  // the same left edge, with its center a few pixels further left, isn't "to the left".
  function distanceAlong(from, to, direction) {
    const MIN_SHIFT_SHARE = 0.1;
    const horizontal = direction === 'left' || direction === 'right';
    const [fromStart, fromEnd, toStart, toEnd] = horizontal
      ? [from.left, from.right, to.left, to.right]
      : [from.top, from.bottom, to.top, to.bottom];
    const forward = direction === 'right' || direction === 'down';
    const shift = ((toStart + toEnd) - (fromStart + fromEnd)) / 2 * (forward ? 1 : -1);
    const minShift = MIN_SHIFT_SHARE * Math.min(fromEnd - fromStart, toEnd - toStart);
    if (shift <= minShift) return null;
    return Math.max(0, forward ? toStart - fromEnd : fromStart - toEnd);
  }

  function distanceAcross(from, to, direction) {
    const horizontal = direction === 'left' || direction === 'right';
    const [fromStart, fromEnd, toStart, toEnd] = horizontal
      ? [from.top, from.bottom, to.top, to.bottom]
      : [from.left, from.right, to.left, to.right];
    return Math.max(0, toStart - fromEnd, fromStart - toEnd);
  }

  function focusableCandidates() {
    const usable = Array.from(focusScope().querySelectorAll(FOCUSABLE_SELECTOR)).filter(isUsable);
    // A container with its own focusable children (e.g. the header bar) would swallow them.
    const containers = new Set();
    for (const element of usable) {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) containers.add(parent);
    }
    const leaves = usable.filter((element) => !containers.has(element));
    const linksByHref = groupBy(leaves.filter((element) => element.getAttribute('href')), (element) => element.getAttribute('href'));
    return leaves.filter((element) => !repeatsLargerLink(element, linksByHref.get(element.getAttribute('href'))));
  }

  // Show cards wrap the image in one link and repeat it on the title; one stop per card is enough.
  function repeatsLargerLink(element, sameHrefLinks) {
    if (!sameHrefLinks || sameHrefLinks.length < 2) return false;
    const inner = element.getBoundingClientRect();
    return sameHrefLinks.some((other) => {
      if (other === element) return false;
      const outer = other.getBoundingClientRect();
      const larger = outer.width * outer.height > inner.width * inner.height;
      return larger && outer.left <= inner.left && outer.top <= inner.top && outer.right >= inner.right && outer.bottom >= inner.bottom;
    });
  }

  function groupBy(items, keyOf) {
    const groups = new Map();
    for (const item of items) {
      const key = keyOf(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return groups;
  }

  function isUsable(element) {
    if (element.disabled || element.getAttribute('aria-hidden') === 'true') return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;
    const style = root.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && opacityOf(style) > 0.05;
  }

  // The S90F's engine formats computed numbers in the TV's locale: in Polish, Player's buttons
  // report opacity "0,9", which Number() reads as NaN.
  function opacityOf(style) {
    return parseFloat(style.opacity.replace(',', '.'));
  }

  function nearestTopLeft(candidates) {
    const onScreen = candidates.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < root.innerHeight && rect.right > 0 && rect.left < root.innerWidth;
    });
    const distance = (element) => {
      const rect = element.getBoundingClientRect();
      return Math.hypot(Math.max(0, rect.left), Math.max(0, rect.top));
    };
    return onScreen.sort((a, b) => distance(a) - distance(b))[0] || null;
  }

  function focusElement(element) {
    if (!element) return;
    const previous = document.querySelector(`[${FOCUS_MARKER}]`);
    if (previous) previous.removeAttribute(FOCUS_MARKER);
    element.setAttribute(FOCUS_MARKER, '');
    if (!element.matches('a[href], button, input, select, textarea, [tabindex]')) {
      element.setAttribute('tabindex', '-1');
    }
    // Native focus on a text field opens the TV's on-screen keyboard; that waits for Enter.
    if (isTextField(element)) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    } else {
      element.focus({ preventScroll: true });
    }
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }

  function focusedElement() {
    const element = focusScope().querySelector(`[${FOCUS_MARKER}]`);
    return element && isUsable(element) ? element : null;
  }

  // In fullscreen only the player is on screen; the page behind it must not take focus, or OK and
  // the arrows would act on a hidden button instead of the video.
  function focusScope() {
    return document.fullscreenElement || document;
  }

  function activate(element) {
    // While editing, Enter belongs to the field (e.g. submitting a search).
    if (isEditing(element)) return false;
    if (isTextField(element)) element.focus();
    else if (element.matches(WATCH_BUTTON)) watchFullscreen(element);
    else element.click();
    return true;
  }

  // "Oglądaj" plays the video in a small box on the page; a TV user wants it fullscreen. The
  // browser allows fullscreen only for about 5 seconds after a key press, and the TV often needs
  // longer to start the video, so this keeps trying until the video plays fullscreen: whenever the
  // browser allows it again, which every key press does. Leaving the page or Back ends the wish.
  function watchFullscreen(button) {
    if (!playingVideo()) button.click();
    const wish = { page: root.location.href };
    fullscreenWish = wish;
    const tryOnce = () => {
      if (fullscreenWish !== wish || root.location.href !== wish.page || playingFullscreen()) {
        if (fullscreenWish === wish) fullscreenWish = null;
        clearInterval(timer);
      } else if (!document.fullscreenElement && root.navigator.userActivation.isActive) {
        enterFullscreen();
      }
    };
    const timer = setInterval(tryOnce, 200);
    tryOnce();
  }

  // Player's own fullscreen button keeps its controls in step, but it only exists once the video
  // plays (sized 0x0 until the mouse moves; clicking it works). Before that, the box it would put
  // fullscreen is requested directly, so a slow start doesn't use up the browser's window.
  function enterFullscreen() {
    const button = Array.from(document.querySelectorAll('button[aria-label]'))
      .find((candidate) => /pełny ekran/i.test(candidate.getAttribute('aria-label')));
    if (button) button.click();
    else document.querySelector(PLAYER_BOX)?.requestFullscreen().catch(() => {});
  }

  // Player may swap its box when an ad ends, which drops fullscreen, so being fullscreen isn't
  // enough: the video must be playing in it.
  function playingFullscreen() {
    const box = document.fullscreenElement;
    return Boolean(box) && Array.from(box.querySelectorAll('video')).some(isPlaying);
  }

  function playingVideo() {
    return Array.from(document.querySelectorAll('video')).find(isPlaying) || null;
  }

  function isPlaying(video) {
    return !video.paused && video.readyState > 2;
  }

  function goBack(current) {
    if (current && isEditing(current)) {
      current.blur();
      return true;
    }
    if (root.history.length > 1) {
      root.history.back();
      return true;
    }
    return false;
  }

  function scrollPage(direction) {
    const step = 0.6;
    const offsets = {
      down: [0, root.innerHeight * step],
      up: [0, -root.innerHeight * step],
      right: [root.innerWidth * step, 0],
      left: [-root.innerWidth * step, 0],
    };
    const [x, y] = offsets[direction];
    root.scrollBy({ left: x, top: y, behavior: 'smooth' });
  }

  function watchedVideo() {
    const screenArea = root.innerWidth * root.innerHeight;
    return (
      Array.from(document.querySelectorAll('video')).find((video) => {
        if (video.readyState === 0) return false;
        const rect = video.getBoundingClientRect();
        return (rect.width * rect.height) / screenArea >= WATCHING_SCREEN_SHARE;
      }) || null
    );
  }

  function togglePlayback(video) {
    if (video.paused) video.play();
    else video.pause();
    return true;
  }

  function seekBy(video, seconds) {
    const end = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.min(end, Math.max(0, video.currentTime + seconds));
    return true;
  }

  function isTextField(element) {
    return element.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea');
  }

  function isEditing(element) {
    return isTextField(element) && document.activeElement === element;
  }

  // Up/down always leave the field; left/right move the caret until it reaches the text's edge.
  function caretCanMove(field, direction) {
    if (direction === 'left') return field.selectionStart > 0;
    if (direction === 'right') return field.selectionEnd < field.value.length;
    return false;
  }

  // Several versions of the module can sit side by side in TizenBrew, and autolaunch may point at
  // an old one; the corner shows which one runs.
  function showVersion() {
    const badge = document.createElement('div');
    badge.textContent = `Player.pl remote ${VERSION}`;
    badge.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;padding:6px 12px;' +
      'background:rgba(0,0,0,0.75);color:#ffd400;font:16px sans-serif;border-radius:6px;pointer-events:none';
    document.body.appendChild(badge);
    setTimeout(() => badge.remove(), 3000);
  }

  // A show or episode page's main button gets focus first, like the primary action in a TV app:
  // "Oglądaj" whenever it's there, even while Player blocks it because a video already plays (OK on
  // it then goes fullscreen); otherwise the first other button, such as "Zaloguj się, by oglądać".
  // Player switches pages without reloading, and an isolated world can't wrap the page's history
  // API, so this polls the address. It never takes focus from an item the user already moved to.
  function focusMainButtonOnEachPage() {
    const OTHER_BUTTON = '.detail__buttons :is(a[href], button):not(.button--blocked):not(.favourite-toggle__wrapper)';
    const WAIT_MS = 10000;
    let page = null;
    let waitingSince = 0;
    let lastKeyAt = 0;
    root.addEventListener('keydown', () => { lastKeyAt = Date.now(); }, true);
    setInterval(() => {
      if (root.location.href !== page) {
        page = root.location.href;
        waitingSince = Date.now();
      }
      if (!waitingSince || lastKeyAt > waitingSince || Date.now() - waitingSince > WAIT_MS) return;
      const usableIn = (selector) => Array.from(document.querySelectorAll(selector)).find(isUsable);
      const button = usableIn(WATCH_BUTTON) || usableIn(OTHER_BUTTON);
      if (!button) return;
      focusElement(button);
      waitingSince = 0;
    }, 300);
  }

  function injectFocusStyle() {
    addStyle(`
      [${FOCUS_MARKER}] {
        outline: 4px solid #ffd400 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 8px rgba(255, 212, 0, 0.35) !important;
      }
    `);
  }

  // Player's login page, account.tvn.pl, checks the browser in an inline <head> script that always
  // runs before TizenBrew injects the mod. It reads the TV as Safari 7 and covers the login form with
  // an "unsupported browser" overlay, though the engine (Chromium 120) passes its Chrome 93 minimum.
  function hideTvnBrowserGate() {
    addStyle('.is-old-browser-canvas { display: none !important; }');
  }

  function addStyle(css) {
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }
})(typeof window !== 'undefined' ? window : globalThis);
