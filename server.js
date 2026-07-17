const http = require('node:http');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const multer = require('multer');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data', 'items.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function safeUploadName(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '-');
}

const upload = multer({
  storage: multer.diskStorage({
    destination(request, file, callback) {
      fsSync.mkdirSync(UPLOAD_DIR, { recursive: true });
      callback(null, UPLOAD_DIR);
    },
    filename(request, file, callback) {
      callback(null, `${Date.now()}-${randomUUID()}-${safeUploadName(file.originalname)}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter(request, file, callback) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'];
    callback(allowed.includes(file.mimetype) ? null : new Error('Only JPG, PNG, GIF, PDF, and TXT files are allowed'), allowed.includes(file.mimetype));
  },
});

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

function runUpload(request, response) {
  return new Promise((resolve, reject) => {
    upload.single('file')(request, response, (error) => error ? reject(error) : resolve());
  });
}

function resolveUploadPath(filename) {
  const safeName = path.basename(filename);
  if (!safeName || safeName !== filename || safeName === '.gitkeep') return null;
  return path.join(UPLOAD_DIR, safeName);
}

async function handleUploads(request, response, pathname) {
  const match = pathname.match(/^\/api\/uploads(?:\/([^/]+))?$/);
  if (!match) return false;
  const filename = match[1] ? decodeURIComponent(match[1]) : null;

  if (request.method === 'POST' && !filename) {
    await runUpload(request, response);
    if (!request.file) {
      sendJson(response, 400, { error: 'A file is required in the “file” form field' });
      return true;
    }
    sendJson(response, 201, {
      filename: request.file.filename,
      originalName: request.file.originalname,
      mimeType: request.file.mimetype,
      size: request.file.size,
      url: `/api/uploads/${encodeURIComponent(request.file.filename)}`,
    });
    return true;
  }

  if (request.method === 'GET' && !filename) {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const entries = await fs.readdir(UPLOAD_DIR, { withFileTypes: true });
    const files = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name !== '.gitkeep')
      .map(async (entry) => {
        const stats = await fs.stat(path.join(UPLOAD_DIR, entry.name));
        return { filename: entry.name, size: stats.size, uploadedAt: stats.birthtime.toISOString(), url: `/api/uploads/${encodeURIComponent(entry.name)}` };
      }));
    sendJson(response, 200, files.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)));
    return true;
  }

  const filePath = filename && resolveUploadPath(filename);
  if (!filePath) {
    sendJson(response, 400, { error: 'Invalid filename' });
    return true;
  }

  try {
    await fs.access(filePath);
  } catch {
    sendJson(response, 404, { error: 'File not found' });
    return true;
  }

  if (request.method === 'GET') {
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeUploadName(filename)}"`,
    });
    fsSync.createReadStream(filePath).pipe(response);
    return true;
  }

  if (request.method === 'DELETE') {
    await fs.unlink(filePath);
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
    if (await handleUploads(request, response, pathname)) return;
    if (await handleApi(request, response, pathname)) return;
    if (request.method === 'GET' && await serveStatic(response, pathname)) return;
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    const isClientError = error instanceof SyntaxError || error instanceof multer.MulterError || error.message.includes('files are allowed');
    const status = isClientError ? 400 : 500;
    sendJson(response, status, { error: isClientError ? error.message : 'Internal server error' });
    console.error(error);
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`CRUD app running at http://localhost:${PORT}`));
}

module.exports = { server, validateItem, safeUploadName, resolveUploadPath };
