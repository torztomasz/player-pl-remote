// TizenBrew site mod: makes Player's own website (player.pl) usable with a Samsung TV remote.
// It adds focus navigation and key handling and presents the TV's browser as desktop Chrome;
// playback and DRM are left to Player's web player.
(function (root) {
  'use strict';

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

  if (typeof module === 'object' && module.exports) {
    module.exports = { pickNext, desktopUserAgent };
    return;
  }
  presentAsDesktopChrome();
  // TizenBrew evaluates the mod in every execution context, including ad and tracking iframes.
  if (root.top !== root || root.__playerPlRemote) return;
  root.__playerPlRemote = true;
  main();

  function main() {
    reloadIfBlocked();
    // Capture phase, so the site's own key handlers can't swallow remote keys first.
    root.addEventListener('keydown', handleKey, true);
    // TizenBrew may inject the mod before <head> exists.
    whenDocumentReady(injectFocusStyle);
    if (root.location.hostname === 'account.tvn.pl') whenDocumentReady(hideTvnBrowserGate);
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
    const handled = (video && handleVideoKey(event.keyCode, video)) || handleNavigationKey(event.keyCode);
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
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
      case KEY.BACK:
        if (document.fullscreenElement) {
          document.exitFullscreen();
          return true;
        }
        return false;
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

  // Gap between the edges in `direction`, or null when `to` doesn't lie ahead of `from`.
  function distanceAlong(from, to, direction) {
    const center = (rect) => ({ x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 });
    const a = center(from);
    const b = center(to);
    const [isAhead, gap] = {
      right: [b.x > a.x, to.left - from.right],
      left: [b.x < a.x, from.left - to.right],
      down: [b.y > a.y, to.top - from.bottom],
      up: [b.y < a.y, from.top - to.bottom],
    }[direction];
    return isAhead ? Math.max(0, gap) : null;
  }

  function distanceAcross(from, to, direction) {
    const horizontal = direction === 'left' || direction === 'right';
    const [fromStart, fromEnd, toStart, toEnd] = horizontal
      ? [from.top, from.bottom, to.top, to.bottom]
      : [from.left, from.right, to.left, to.right];
    return Math.max(0, toStart - fromEnd, fromStart - toEnd);
  }

  function focusableCandidates() {
    const usable = Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isUsable);
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
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
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
    const element = document.querySelector(`[${FOCUS_MARKER}]`);
    return element && isUsable(element) ? element : null;
  }

  function activate(element) {
    // While editing, Enter belongs to the field (e.g. submitting a search).
    if (isEditing(element)) return false;
    if (isTextField(element)) element.focus();
    else element.click();
    return true;
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
