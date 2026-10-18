// The mod skips invisible elements by their computed opacity. Method: feed the strings the TV's
// engine really returns. The S90F, set to Polish, gives "0,9" for Player's buttons (read over the
// TV's DevTools), where desktop Chrome gives "0.9".
const test = require('node:test');
const assert = require('node:assert/strict');
const { opacityOf } = require('../src/userScript.js');

test('reads opacity with a decimal comma, as the TV in Polish reports it', () => {
  assert.equal(opacityOf({ opacity: '0,9' }), 0.9);
});

test('reads opacity with a decimal point, as desktop Chrome reports it', () => {
  assert.equal(opacityOf({ opacity: '0.9' }), 0.9);
  assert.equal(opacityOf({ opacity: '1' }), 1);
  assert.equal(opacityOf({ opacity: '0' }), 0);
});
