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

test('GET /api/stats returns application statistics', async () => {
  const { server } = require('../server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/stats`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.counts.items, 'number');
    assert.equal(typeof body.counts.uploadedFiles, 'number');
    assert.equal(typeof body.uptimeSeconds, 'number');
    assert.match(body.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
