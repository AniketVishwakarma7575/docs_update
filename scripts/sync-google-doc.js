const fs = require('node:fs/promises');
const path = require('node:path');
const { google } = require('googleapis');

const ROOT = path.resolve(__dirname, '..');

function parseMarkdown(markdown) {
  const output = [];
  const styles = [];
  let index = 1;
  let inCode = false;

  for (const originalLine of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (originalLine.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    let line = originalLine;
    let namedStyleType;
    let bullet = false;
    if (!inCode) {
      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        line = heading[2];
        namedStyleType = heading[1].length === 1 ? 'TITLE' : `HEADING_${Math.min(heading[1].length - 1, 3)}`;
      } else if (/^[-*]\s+/.test(line)) {
        line = line.replace(/^[-*]\s+/, '');
        bullet = true;
      }
    }
    line = line.replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1');
    const text = `${line}\n`;
    const range = { startIndex: index, endIndex: index + text.length };
    output.push(text);
    if (namedStyleType) styles.push({ kind: 'paragraph', range, namedStyleType });
    if (bullet) styles.push({ kind: 'bullet', range });
    if (inCode && line) styles.push({ kind: 'code', range });
    index += text.length;
  }
  return { text: output.join(''), styles };
}

async function syncGoogleDoc() {
  const documentId = process.env.GOOGLE_DOC_ID;
  const encodedCredentials = process.env.GOOGLE_SA_KEY_BASE64;
  if (!documentId || !encodedCredentials) {
    throw new Error('GOOGLE_DOC_ID and GOOGLE_SA_KEY_BASE64 GitHub secrets are required.');
  }
  const credentials = JSON.parse(Buffer.from(encodedCredentials, 'base64').toString('utf8'));
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/documents'] });
  const docs = google.docs({ version: 'v1', auth });
  const parsed = parseMarkdown(await fs.readFile(path.join(ROOT, 'API_DOCS.md'), 'utf8'));
  const current = await docs.documents.get({ documentId });
  const endIndex = current.data.body.content.at(-1).endIndex;
  const requests = [];
  if (endIndex > 2) requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
  requests.push({ insertText: { location: { index: 1 }, text: parsed.text } });
  for (const style of parsed.styles) {
    if (style.kind === 'paragraph') requests.push({ updateParagraphStyle: { range: style.range, paragraphStyle: { namedStyleType: style.namedStyleType }, fields: 'namedStyleType' } });
    if (style.kind === 'bullet') requests.push({ createParagraphBullets: { range: style.range, bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE' } });
    if (style.kind === 'code') requests.push({ updateTextStyle: { range: style.range, textStyle: { weightedFontFamily: { fontFamily: 'Roboto Mono' }, backgroundColor: { color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } } } }, fields: 'weightedFontFamily,backgroundColor' } });
  }
  await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
  console.log(`Synced API_DOCS.md to Google Doc ${documentId}.`);
}

if (require.main === module) {
  syncGoogleDoc().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { parseMarkdown };
