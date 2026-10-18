// The mod shows its version on screen so a TV user can tell which TizenBrew module is running.
// Method: the constant in the script must match the version TizenBrew lists from package.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const { VERSION } = require('../src/userScript.js');
const { version } = require('../package.json');

test('the on-screen version matches package.json', () => {
  assert.equal(VERSION, version);
});
