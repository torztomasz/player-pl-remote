// Spatial navigation is the part of the mod a remote user feels on every key press, and the only
// part that can be checked without a TV. Method: lay out rectangles shaped like Player's UI
// (rows of tiles, a header, a lone button) and assert where each D-pad press should land.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickNext } = require('../src/userScript.js');

function rect(left, top, width, height) {
  return { left, top, right: left + width, bottom: top + height };
}

// Two rows of three 200x120 tiles with 20px gaps, like a carousel of shows.
const tiles = {};
for (const [row, top] of [['a', 0], ['b', 140]]) {
  for (const [column, left] of [[1, 0], [2, 220], [3, 440]]) {
    tiles[`${row}${column}`] = rect(left, top, 200, 120);
  }
}
const asCandidates = (rects) => Object.entries(rects).map(([item, r]) => ({ item, rect: r }));

test('moves along the row to the adjacent tile', () => {
  assert.equal(pickNext(tiles.a1, asCandidates(tiles), 'right'), 'a2');
  assert.equal(pickNext(tiles.a2, asCandidates(tiles), 'left'), 'a1');
});

test('moves between rows to the tile in the same column', () => {
  assert.equal(pickNext(tiles.a2, asCandidates(tiles), 'down'), 'b2');
  assert.equal(pickNext(tiles.b3, asCandidates(tiles), 'up'), 'a3');
});

test('returns nothing at an edge so the caller can scroll instead', () => {
  assert.equal(pickNext(tiles.a1, asCandidates(tiles), 'left'), null);
  assert.equal(pickNext(tiles.a1, asCandidates(tiles), 'up'), null);
});

test('stays in the current row over a nearer tile in another row', () => {
  // The off-row tile starts just 5px to the right but sits below the current row.
  const candidates = asCandidates({ sameRowFar: rect(500, 0, 200, 120), nextRowNear: rect(205, 130, 200, 120) });
  assert.equal(pickNext(rect(0, 0, 200, 120), candidates, 'right'), 'sameRowFar');
});

test('falls back to another row only when the current row has nothing ahead', () => {
  const candidates = asCandidates({ nextRowAhead: rect(700, 140, 200, 120) });
  assert.equal(pickNext(tiles.a3, candidates, 'right'), 'nextRowAhead');
});

test('reaches a narrow header button above a wide row', () => {
  const candidates = asCandidates({ search: rect(600, -80, 60, 40), ...tiles });
  assert.equal(pickNext(tiles.a3, candidates, 'up'), 'search');
});

test('moves to an element nested inside the current one when it lies ahead', () => {
  // A card's "play" button overlaps the card; pressing down from the card's title row reaches it.
  const card = rect(0, 0, 400, 300);
  const candidates = asCandidates({ playButton: rect(20, 240, 100, 40) });
  assert.equal(pickNext(card, candidates, 'down'), 'playButton');
});
