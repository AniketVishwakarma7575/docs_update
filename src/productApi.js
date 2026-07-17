const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const PRODUCTS_FILE = process.env.PRODUCTS_DATA_FILE || path.join(__dirname, '..', 'data', 'products.json');

async function readProducts() {
  try {
    return JSON.parse(await fs.readFile(PRODUCTS_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }
}

async function writeProducts(products) {
  await fs.mkdir(path.dirname(PRODUCTS_FILE), { recursive: true });
  await fs.writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}

function validateProduct(input) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const price = Number(input.price);
  const stock = input.stock === undefined ? 0 : Number(input.stock);
  if (!name) return { error: 'Name is required' };
  if (!Number.isFinite(price) || price < 0) return { error: 'Price must be a non-negative number' };
  if (!Number.isInteger(stock) || stock < 0) return { error: 'Stock must be a non-negative integer' };
  return {
    value: {
      name,
      description: typeof input.description === 'string' ? input.description.trim() : '',
      price,
      stock,
    },
  };
}

async function handleProductApi(request, response, pathname, helpers) {
  const match = pathname.match(/^\/api\/products(?:\/([^/]+))?$/);
  if (!match) return false;
  const id = match[1] ? decodeURIComponent(match[1]) : null;
  const products = await readProducts();

  // GET /api/products - list all products.
  if (request.method === 'GET' && !id) {
    helpers.sendJson(response, 200, products);
    return true;
  }

  // GET /api/products/:id - get one product.
  if (request.method === 'GET' && id) {
    const product = products.find((entry) => entry.id === id);
    helpers.sendJson(response, product ? 200 : 404, product || { error: 'Product not found' });
    return true;
  }

  // POST /api/products - create a product.
  if (request.method === 'POST' && !id) {
    const result = validateProduct(await helpers.readJson(request));
    if (result.error) {
      helpers.sendJson(response, 400, { error: result.error });
      return true;
    }
    const product = { id: randomUUID(), ...result.value, createdAt: new Date().toISOString() };
    products.push(product);
    await writeProducts(products);
    helpers.sendJson(response, 201, product);
    return true;
  }

  // PUT /api/products/:id - replace an existing product.
  if (request.method === 'PUT' && id) {
    const index = products.findIndex((entry) => entry.id === id);
    if (index === -1) {
      helpers.sendJson(response, 404, { error: 'Product not found' });
      return true;
    }
    const result = validateProduct(await helpers.readJson(request));
    if (result.error) {
      helpers.sendJson(response, 400, { error: result.error });
      return true;
    }
    products[index] = { ...products[index], ...result.value, updatedAt: new Date().toISOString() };
    await writeProducts(products);
    helpers.sendJson(response, 200, products[index]);
    return true;
  }

  // DELETE /api/products/:id - delete one product.
  if (request.method === 'DELETE' && id) {
    const index = products.findIndex((entry) => entry.id === id);
    if (index === -1) {
      helpers.sendJson(response, 404, { error: 'Product not found' });
      return true;
    }
    products.splice(index, 1);
    await writeProducts(products);
    response.writeHead(204);
    response.end();
    return true;
  }

  helpers.sendJson(response, 405, { error: 'Method not allowed' });
  return true;
}

module.exports = { handleProductApi, validateProduct, readProducts, writeProducts };
