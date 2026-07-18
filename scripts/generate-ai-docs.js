const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';
const MAX_SOURCE_CHARS = 180_000;

function outputText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('');
}

function sourceFiles() {
  const supported = new Set(['.js', '.cjs', '.mjs', '.ts', '.json', '.yaml', '.yml']);
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => supported.has(path.extname(file)))
    .filter((file) => !['package-lock.json'].includes(file))
    .filter((file) => !file.startsWith('.github/'))
    .filter((file) => !file.startsWith('test/'));
}

async function buildContext() {
  let context = '';
  for (const file of sourceFiles()) {
    const content = await fs.readFile(path.join(ROOT, file), 'utf8');
    const section = `\n\n===== ${file} =====\n${content}`;
    if (context.length + section.length > MAX_SOURCE_CHARS) break;
    context += section;
  }
  return context;
}

async function generateDocs() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required. Store it as a GitHub Actions secret; never commit it.');
  }

  const source = await buildContext();
  if (!source) throw new Error('No source files were found to document.');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: 'medium' },
      instructions: [
        'You are a senior API technical writer. Generate documentation only from the supplied repository files.',
        'Never invent routes, fields, status codes, authentication, validations, or behavior.',
        'If implementation evidence is incomplete, clearly label the detail as not specified.',
        'Write concise, valid GitHub-flavored Markdown for developers and QA testers.',
      ].join(' '),
      input: `Generate two complete documents for this Node.js project.

README requirements:
- project overview and features
- prerequisites, installation, configuration, run and test commands
- concise API route summary
- file-upload constraints and project structure when present
- GitHub automation setup, including required secret names, without secret values

API documentation requirements:
- base URL and content types
- every implemented route grouped by resource
- method, path, purpose, parameters, request body/form fields
- success status and realistic response example derived from code
- every implemented validation and error case with status where code proves it
- tester-ready curl examples and a compact test checklist
- explicitly distinguish JSON and multipart/form-data routes

Repository source:${source}`,
      text: {
        format: {
          type: 'json_schema',
          name: 'generated_documentation',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              readme: { type: 'string' },
              apiDocs: { type: 'string' },
            },
            required: ['readme', 'apiDocs'],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  const result = await response.json();
  if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${result.error?.message || 'Unknown error'}`);
  const text = outputText(result);
  if (!text) throw new Error('OpenAI returned no documentation text.');
  const docs = JSON.parse(text);
  if (!docs.readme.trim() || !docs.apiDocs.trim()) throw new Error('Generated documentation was empty.');

  await fs.writeFile(path.join(ROOT, 'README.md'), `${docs.readme.trim()}\n`, 'utf8');
  await fs.writeFile(path.join(ROOT, 'API_DOCS.md'), `${docs.apiDocs.trim()}\n`, 'utf8');
  console.log(`Generated README.md and API_DOCS.md with ${MODEL}.`);
}

if (require.main === module) {
  generateDocs().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { outputText, sourceFiles };
