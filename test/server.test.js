const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const productTestDir = path.join(os.tmpdir(), `node-crud-products-${randomUUID()}`);
process.env.PRODUCTS_DATA_FILE = path.join(productTestDir, 'products.json');
const { validateItem, safeUploadName, resolveUploadPath } = require('../server');
const { server } = require('../server');
const { validateProduct } = require('../src/productApi');

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

test('validateProduct accepts valid product data', () => {
  assert.deepEqual(validateProduct({ name: ' Laptop ', description: ' Work machine ', price: '999.50', stock: '4' }), {
    value: { name: 'Laptop', description: 'Work machine', price: 999.5, stock: 4 },
  });
});

test('validateProduct rejects invalid price and stock values', () => {
  assert.equal(validateProduct({ name: 'Laptop', price: -1 }).error, 'Price must be a non-negative number');
  assert.equal(validateProduct({ name: 'Laptop', price: 10, stock: 1.5 }).error, 'Stock must be a non-negative integer');
});

test('product API supports the complete five-route CRUD lifecycle', async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const createResponse = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Laptop', description: 'Work machine', price: 999.5, stock: 4 }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();

    const listResponse = await fetch(`${baseUrl}/api/products`);
    assert.equal(listResponse.status, 200);
    assert.equal((await listResponse.json()).length, 1);

    const getResponse = await fetch(`${baseUrl}/api/products/${created.id}`);
    assert.equal(getResponse.status, 200);
    assert.equal((await getResponse.json()).name, 'Laptop');

    const updateResponse = await fetch(`${baseUrl}/api/products/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Laptop Pro', description: 'Updated', price: 1299, stock: 2 }),
    });
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).name, 'Laptop Pro');

    const deleteResponse = await fetch(`${baseUrl}/api/products/${created.id}`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 204);
    assert.equal((await fetch(`${baseUrl}/api/products/${created.id}`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(productTestDir, { recursive: true, force: true });
  }
});

test('GET /api/stats returns application statistics', async () => {
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
