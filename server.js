const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data', 'items.json');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

async function readItems() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }
}

async function writeItems(items) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(items, null, 2));
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body is too large');
  }
  return JSON.parse(body || '{}');
}

function validateItem(input) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  return name ? { name, description } : null;
}

async function handleApi(request, response, pathname) {
  const match = pathname.match(/^\/api\/items(?:\/([^/]+))?$/);
  if (!match) return false;

  const id = match[1] ? decodeURIComponent(match[1]) : null;
  const items = await readItems();

  if (request.method === 'GET' && !id) {
    sendJson(response, 200, items);
    return true;
  }

  if (request.method === 'GET' && id) {
    const item = items.find((entry) => entry.id === id);
    sendJson(response, item ? 200 : 404, item || { error: 'Item not found' });
    return true;
  }

  if (request.method === 'POST' && !id) {
    const values = validateItem(await readJson(request));
    if (!values) {
      sendJson(response, 400, { error: 'Name is required' });
      return true;
    }
    const item = { id: randomUUID(), ...values, createdAt: new Date().toISOString() };
    items.push(item);
    await writeItems(items);
    sendJson(response, 201, item);
    return true;
  }

  if (request.method === 'PUT' && id) {
    const index = items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      sendJson(response, 404, { error: 'Item not found' });
      return true;
    }
    const values = validateItem(await readJson(request));
    if (!values) {
      sendJson(response, 400, { error: 'Name is required' });
      return true;
    }
    items[index] = { ...items[index], ...values, updatedAt: new Date().toISOString() };
    await writeItems(items);
    sendJson(response, 200, items[index]);
    return true;
  }

  if (request.method === 'DELETE' && id) {
    const index = items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      sendJson(response, 404, { error: 'Item not found' });
      return true;
    }
    items.splice(index, 1);
    await writeItems(items);
    response.writeHead(204);
    response.end();
    return true;
  }

  sendJson(response, 405, { error: 'Method not allowed' });
  return true;
}

async function serveStatic(response, pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(PUBLIC_DIR, relativePath);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) return false;

  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    response.end(content);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (await handleApi(request, response, pathname)) return;
    if (request.method === 'GET' && await serveStatic(response, pathname)) return;
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 500;
    sendJson(response, status, { error: status === 400 ? 'Invalid JSON' : 'Internal server error' });
    console.error(error);
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`CRUD app running at http://localhost:${PORT}`));
}

module.exports = { server, validateItem };
