// Player's site decides "supported browser or not" from the user agent alone. Method: feed real
// Tizen user agents through desktopUserAgent and check that nothing Player matches as a TV
// survives, while the Chromium version stays truthful for feature checks.
const test = require('node:test');
const assert = require('node:assert/strict');
const { desktopUserAgent } = require('../src/userScript.js');

const PLAYER_TV_MARKERS = ['SMART-TV', 'SMARTTV', 'TIZEN', 'HBBTV'];
const TIZEN_9_TV = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 9.0) AppleWebKit/537.36 (KHTML, like Gecko) 120.0.6099.5/9.0 TV Safari/537.36';
const TIZEN_10_TV = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 10.0) AppleWebKit/537.36 (KHTML, like Gecko) 130.0.6723.58/10.0 TV Safari/537.36';

test('removes every marker Player treats as a TV', () => {
  const userAgent = desktopUserAgent(TIZEN_9_TV).toUpperCase();
  for (const marker of PLAYER_TV_MARKERS) assert.ok(!userAgent.includes(marker), marker);
});

test("keeps the engine's Chromium major version", () => {
  assert.match(desktopUserAgent(TIZEN_9_TV), /Chrome\/120\.0\.0\.0 /);
  assert.match(desktopUserAgent(TIZEN_10_TV), /Chrome\/130\.0\.0\.0 /);
});

test('falls back to the 2025 engine version when none is found', () => {
  assert.match(desktopUserAgent('Mozilla/5.0 (SMART-TV; Tizen)'), /Chrome\/120\.0\.0\.0 /);
});
