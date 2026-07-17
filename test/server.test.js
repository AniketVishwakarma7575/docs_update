const test = require('node:test');
const assert = require('node:assert/strict');
const { validateItem, safeUploadName, resolveUploadPath } = require('../server');

test('validateItem accepts and trims a valid item', () => {
  assert.deepEqual(validateItem({ name: '  Test  ', description: ' Notes ' }), {
    name: 'Test',
    description: 'Notes',
  });
});

test('validateItem rejects an empty name', () => {
  assert.equal(validateItem({ name: '   ' }), null);
});

test('safeUploadName removes unsafe filename characters', () => {
  assert.equal(safeUploadName('../my file?.txt'), 'my-file-.txt');
});

test('resolveUploadPath rejects path traversal', () => {
  assert.equal(resolveUploadPath('../secret.txt'), null);
});
