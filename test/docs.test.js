const test = require('node:test');
const assert = require('node:assert/strict');
const { outputText } = require('../scripts/generate-ai-docs');
const { parseMarkdown } = require('../scripts/sync-google-doc');

test('outputText extracts text from a raw Responses API response', () => {
  assert.equal(outputText({ output: [{ content: [{ type: 'output_text', text: '{"ok":true}' }] }] }), '{"ok":true}');
});

test('parseMarkdown removes Markdown markers and records formatting', () => {
  const parsed = parseMarkdown('# API\n\n- item\n\n```json\n{"ok":true}\n```');
  assert.match(parsed.text, /^API/);
  assert.doesNotMatch(parsed.text, /```/);
  assert.ok(parsed.styles.some((style) => style.kind === 'paragraph'));
  assert.ok(parsed.styles.some((style) => style.kind === 'bullet'));
  assert.ok(parsed.styles.some((style) => style.kind === 'code'));
});
