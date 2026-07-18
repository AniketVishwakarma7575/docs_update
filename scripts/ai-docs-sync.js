const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const MAX_SOURCE_CHARS = Number(process.env.AI_DOCS_MAX_SOURCE_CHARS) || 120000;
const MAX_OUTPUT_TOKENS = Number(process.env.AI_DOCS_MAX_OUTPUT_TOKENS) || 16000;
const MAX_CONTINUATIONS = Number(process.env.AI_DOCS_MAX_CONTINUATIONS) || 3;
const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.json', '.yaml', '.yml']);
const EXCLUDED_DIRECTORIES = new Set(['.git', '.github', 'node_modules', 'coverage', 'data', 'dist', 'uploads']);

async function collectSourceFiles(directory, root = directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const lowerName = entry.name.toLowerCase();
    if (
      entry.name === '.env'
      || entry.name.endsWith('.pem')
      || entry.name.endsWith('.key')
      || lowerName.includes('credential')
      || lowerName.includes('service-account')
      || lowerName.includes('secret')
    ) continue;

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        files.push(...await collectSourceFiles(fullPath, root));
      }
      continue;
    }

    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name)) || entry.name === 'package-lock.json') continue;
    files.push(path.relative(root, fullPath).replace(/\\/g, '/'));
  }
  return files.sort();
}

async function buildSourceContext(sourceDirectory) {
  let context = '';
  const includedFiles = [];
  for (const file of await collectSourceFiles(sourceDirectory)) {
    const content = await fs.readFile(path.join(sourceDirectory, file), 'utf8');
    const section = `\n\n===== ${file} =====\n${content}`;
    if (context.length + section.length > MAX_SOURCE_CHARS) break;
    context += section;
    includedFiles.push(file);
  }
  return { context, includedFiles };
}

function buildPrompt(sourceContext) {
  return `Create complete GitHub-flavored Markdown API documentation for developers and QA testers from the repository source below.

Rules:
- Use only facts proven by source code. Never invent routes, validation, authentication, responses, or errors.
- Include every implemented endpoint and its full mounted path.
- Document method, path, purpose, content type, authentication, path/query parameters, request fields, validation, success response, provable error cases, cURL example, and tester checklist.
- Clearly distinguish JSON, multipart upload, SSE, static-file, UI, and health endpoints.
- When a detail is not established in code, write "Not specified in implementation".
- Return only the Markdown document. Do not wrap the complete document in a code fence.

Use this structure for every endpoint:
### METHOD /path
| Property | Value |
|---|---|
| Purpose | ... |

#### Request Fields
| Field | Type | Required | Notes |
|---|---|---|---|

#### Success Response - STATUS
\`\`\`json
{}
\`\`\`

#### Key Response Fields
| Field | Type | Notes |
|---|---|---|

#### Error Cases
| Status | Trigger | Response Message |
|---|---|---|

#### cURL Example
\`\`\`bash
curl ...
\`\`\`

Repository source:${sourceContext}`;
}

function extractGeminiText(body) {
  return (body.candidates || [])
    .flatMap(candidate => candidate.content?.parts || [])
    .filter(part => typeof part.text === 'string')
    .map(part => part.text)
    .join('');
}

function cleanMarkdownResponse(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

async function generateApiDocs(sourceContext) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required.');

  const contents = [{ role: 'user', parts: [{ text: buildPrompt(sourceContext) }] }];
  const segments = [];
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-goog-api-key': process.env.GEMINI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: 'You are a senior API technical writer. Produce accurate, concise documentation using only supplied source code.' }],
        },
        contents,
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.2 },
      }),
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(`Gemini API error ${response.status}: ${body.error?.message || 'Unknown error'}`);
    }

    const finishReason = body.candidates?.[0]?.finishReason;
    const text = extractGeminiText(body);
    if (!text && body.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the request: ${body.promptFeedback.blockReason}`);
    }
    if (!text?.trim()) throw new Error(`Gemini returned no Markdown. Finish reason: ${finishReason || 'unknown'}.`);

    segments.push(text);
    if (finishReason !== 'MAX_TOKENS') {
      if (finishReason && finishReason !== 'STOP') {
        throw new Error(`Gemini stopped with finish reason ${finishReason}.`);
      }
      return cleanMarkdownResponse(segments.join(''));
    }

    if (attempt === MAX_CONTINUATIONS) break;
    contents.push(
      { role: 'model', parts: [{ text }] },
      {
        role: 'user',
        parts: [{ text: 'Continue from the exact character after the previous output. Do not restart or repeat content. Return only the remaining Markdown.' }],
      },
    );
  }

  throw new Error(`Gemini output remained truncated after ${MAX_CONTINUATIONS + 1} segments.`);
}

function parseMarkdownBlocks(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }

    const fence = line.match(/^```(\w+)?/);
    if (fence) {
      const content = [];
      index++;
      while (index < lines.length && !lines[index].startsWith('```')) content.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push({ type: 'code', language: fence[1] || '', text: content.join('\n') });
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      index++;
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      const tableLines = [line];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) tableLines.push(lines[index++]);
      const rows = tableLines.map(row => row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim().replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1')));
      const columnCount = Math.max(...rows.map(row => row.length));
      blocks.push({ type: 'table', rows: rows.map(row => [...row, ...Array(columnCount - row.length).fill('')]) });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      blocks.push({ type: 'bullet', text: line.replace(/^[-*]\s+/, '') });
      index++;
      continue;
    }

    blocks.push({ type: 'paragraph', text: line.replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1') });
    index++;
  }
  return blocks;
}

function rgb(hex) {
  const value = hex.replace('#', '');
  return {
    color: {
      rgbColor: {
        red: parseInt(value.slice(0, 2), 16) / 255,
        green: parseInt(value.slice(2, 4), 16) / 255,
        blue: parseInt(value.slice(4, 6), 16) / 255,
      },
    },
  };
}

function decodeGoogleCredentials() {
  if (!process.env.GOOGLE_SA_KEY_BASE64) throw new Error('GOOGLE_SA_KEY_BASE64 is required.');
  try {
    return JSON.parse(Buffer.from(process.env.GOOGLE_SA_KEY_BASE64, 'base64').toString('utf8'));
  } catch (error) {
    throw new Error(`Invalid GOOGLE_SA_KEY_BASE64: ${error.message}`);
  }
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

async function getGoogleAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = credentials.token_uri || 'https://oauth2.googleapis.com/token';
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/documents',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsignedToken), credentials.private_key).toString('base64url');
  const assertion = `${unsignedToken}.${signature}`;

  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(`Google authentication failed: ${body.error_description || body.error || response.status}`);
  }
  return body.access_token;
}

async function googleDocsRequest(accessToken, documentId, suffix = '', options = {}) {
  const response = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}${suffix}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Google Docs API error ${response.status}: ${body.error?.message || 'Unknown error'}`);
  return body;
}

async function renderStyledMarkdown(accessToken, documentId, markdown) {
  const blocks = parseMarkdownBlocks(markdown);
  let document = await googleDocsRequest(accessToken, documentId);
  const endIndex = document.body.content.at(-1).endIndex;
  const structureRequests = [];
  if (endIndex > 2) structureRequests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
  for (const block of [...blocks].reverse()) {
    if (block.type === 'table') {
      structureRequests.push({ insertTable: { rows: block.rows.length, columns: block.rows[0].length, location: { index: 1 } } });
    } else {
      structureRequests.push({ insertText: { location: { index: 1 }, text: `${block.text}\n` } });
    }
  }
  await googleDocsRequest(accessToken, documentId, ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests: structureRequests }),
  });

  document = await googleDocsRequest(accessToken, documentId);
  const tableBlocks = blocks.filter(block => block.type === 'table');
  let tableElements = document.body.content.filter(item => item.table);
  const cellRequests = [];
  for (let tableIndex = tableElements.length - 1; tableIndex >= 0; tableIndex--) {
    const table = tableElements[tableIndex].table;
    const values = tableBlocks[tableIndex].rows;
    for (let row = values.length - 1; row >= 0; row--) {
      for (let column = values[row].length - 1; column >= 0; column--) {
        const value = String(values[row][column] ?? '');
        if (value) {
          cellRequests.push({
            insertText: {
              location: { index: table.tableRows[row].tableCells[column].content[0].startIndex },
              text: value,
            },
          });
        }
      }
    }
  }
  if (cellRequests.length) {
    await googleDocsRequest(accessToken, documentId, ':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ requests: cellRequests }),
    });
  }

  document = await googleDocsRequest(accessToken, documentId);
  tableElements = document.body.content.filter(item => item.table);
  const finalEndIndex = document.body.content.at(-1).endIndex - 1;
  const styleRequests = [{
    updateTextStyle: {
      range: { startIndex: 1, endIndex: finalEndIndex },
      textStyle: {
        weightedFontFamily: { fontFamily: 'Arial' },
        fontSize: { magnitude: 10.5, unit: 'PT' },
        foregroundColor: rgb('#243247'),
      },
      fields: 'weightedFontFamily,fontSize,foregroundColor',
    },
  }];

  let contentCursor = 0;
  let tableIndex = 0;
  for (const block of blocks) {
    if (block.type === 'table') {
      const tableElement = tableElements[tableIndex++];
      const rowCount = block.rows.length;
      const columnCount = block.rows[0].length;
      const tableStart = tableElement.startIndex;
      const padding = { magnitude: 6, unit: 'PT' };
      for (let row = 0; row < rowCount; row++) {
        styleRequests.push({
          updateTableCellStyle: {
            tableRange: {
              tableCellLocation: { tableStartLocation: { index: tableStart }, rowIndex: row, columnIndex: 0 },
              rowSpan: 1,
              columnSpan: columnCount,
            },
            tableCellStyle: {
              backgroundColor: rgb(row === 0 ? '#1F477A' : row % 2 === 0 ? '#F4F7FB' : '#FFFFFF'),
              contentAlignment: 'MIDDLE',
              paddingTop: padding,
              paddingBottom: padding,
              paddingLeft: padding,
              paddingRight: padding,
            },
            fields: 'backgroundColor,contentAlignment,paddingTop,paddingBottom,paddingLeft,paddingRight',
          },
        });
      }
      for (let row = 0; row < rowCount; row++) {
        for (let column = 0; column < columnCount; column++) {
          const cell = tableElement.table.tableRows[row].tableCells[column];
          const range = { startIndex: cell.content[0].startIndex, endIndex: cell.content[0].endIndex - 1 };
          if (range.endIndex > range.startIndex) {
            styleRequests.push({
              updateTextStyle: {
                range,
                textStyle: {
                  weightedFontFamily: { fontFamily: 'Arial' },
                  fontSize: { magnitude: row === 0 ? 9.5 : 9, unit: 'PT' },
                  bold: row === 0,
                  foregroundColor: rgb(row === 0 ? '#FFFFFF' : '#243247'),
                },
                fields: 'weightedFontFamily,fontSize,bold,foregroundColor',
              },
            });
          }
        }
      }
      continue;
    }

    let target;
    for (let index = contentCursor; index < document.body.content.length; index++) {
      const element = document.body.content[index];
      if (!element.paragraph) continue;
      const paragraphText = element.paragraph.elements.map(item => item.textRun?.content || '').join('').replace(/\n$/, '');
      if (paragraphText === block.text.split('\n')[0]) {
        target = element;
        contentCursor = index + 1;
        break;
      }
    }
    if (!target) continue;

    const range = {
      startIndex: target.startIndex,
      endIndex: Math.min(target.startIndex + block.text.length, finalEndIndex),
    };
    if (block.type === 'heading') {
      const route = block.text.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/);
      if (route) {
        const methodEnd = target.startIndex + route[1].length;
        const methodColors = { GET: '#138A72', POST: '#2563EB', PUT: '#D97706', PATCH: '#7C3AED', DELETE: '#DC2626' };
        styleRequests.push({ updateTextStyle: { range: { startIndex: target.startIndex, endIndex: methodEnd }, textStyle: { bold: true, foregroundColor: rgb('#FFFFFF'), backgroundColor: rgb(methodColors[route[1]]) }, fields: 'bold,foregroundColor,backgroundColor' } });
        styleRequests.push({ updateTextStyle: { range: { startIndex: methodEnd + 1, endIndex: range.endIndex }, textStyle: { bold: true, weightedFontFamily: { fontFamily: 'Roboto Mono' }, foregroundColor: rgb('#173B6C') }, fields: 'bold,weightedFontFamily,foregroundColor' } });
      } else {
        const sizes = { 1: 24, 2: 18, 3: 14, 4: 11 };
        styleRequests.push({ updateTextStyle: { range, textStyle: { bold: true, fontSize: { magnitude: sizes[block.level], unit: 'PT' }, foregroundColor: rgb(block.level < 3 ? '#173B6C' : '#2563EB') }, fields: 'bold,fontSize,foregroundColor' } });
      }
    } else if (block.type === 'code') {
      styleRequests.push({ updateTextStyle: { range, textStyle: { weightedFontFamily: { fontFamily: 'Roboto Mono' }, fontSize: { magnitude: 9, unit: 'PT' }, backgroundColor: rgb('#F1F3F5') }, fields: 'weightedFontFamily,fontSize,backgroundColor' } });
    } else if (block.type === 'bullet') {
      styleRequests.push({ createParagraphBullets: { range, bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE' } });
    }
  }

  for (let index = 0; index < styleRequests.length; index += 400) {
    await googleDocsRequest(accessToken, documentId, ':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ requests: styleRequests.slice(index, index + 400) }),
    });
  }
}

async function main() {
  const sourceDirectory = path.resolve(process.env.AI_SOURCE_DIR || path.join(__dirname, '..'));
  const outputPath = path.resolve(process.env.AI_API_DOCS_PATH || path.join(__dirname, '..', 'API_DOCS.md'));
  const documentId = process.env.GOOGLE_DOC_ID;
  if (!documentId) throw new Error('GOOGLE_DOC_ID is required.');

  const { context, includedFiles } = await buildSourceContext(sourceDirectory);
  if (!context) throw new Error(`No supported source files found in ${sourceDirectory}.`);

  const markdown = await generateApiDocs(context);
  await fs.writeFile(outputPath, `${markdown}\n`, 'utf8');

  const credentials = decodeGoogleCredentials();
  const accessToken = await getGoogleAccessToken(credentials);
  await renderStyledMarkdown(accessToken, documentId, markdown);

  console.log(`Generated ${outputPath} from ${includedFiles.length} source files.`);
  console.log(`Updated Google Doc ${documentId}.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`AI documentation sync failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  cleanMarkdownResponse,
  extractGeminiText,
  parseMarkdownBlocks,
};
