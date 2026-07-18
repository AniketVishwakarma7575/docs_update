const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cleanMarkdownResponse,
  extractGeminiText,
  parseMarkdownBlocks,
} = require('../scripts/ai-docs-sync');

test('extractGeminiText combines response parts', () => {
  const body = {
    candidates: [{ content: { parts: [{ text: '# API' }, { text: '\nDetails' }] } }],
  };
  assert.equal(extractGeminiText(body), '# API\nDetails');
});

test('cleanMarkdownResponse removes a whole-document fence', () => {
  assert.equal(cleanMarkdownResponse('```markdown\n# API\n```'), '# API');
});

test('parseMarkdownBlocks recognizes a route heading, table, and code block', () => {
  const blocks = parseMarkdownBlocks('### GET /items\n\n| Field | Type |\n|---|---|\n| id | number |\n\n```json\n{"ok":true}\n```');
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[1].type, 'table');
  assert.deepEqual(blocks[1].rows[1], ['id', 'number']);
  assert.equal(blocks[2].type, 'code');
});
