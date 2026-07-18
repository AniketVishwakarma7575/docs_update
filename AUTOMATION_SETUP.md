# AI Documentation Automation Setup

The workflow `.github/workflows/ai-docs.yml` runs after application code is pushed or merged into `main`.

## Required GitHub secrets

Open the repository on GitHub and go to **Settings > Secrets and variables > Actions > New repository secret**.

Add these secrets:

- `OPENAI_API_KEY`: a newly generated OpenAI project API key. Never reuse a key exposed in chat or commit it to Git.
- `GOOGLE_DOC_ID`: only the ID from the target Google Docs URL.
- `GOOGLE_SA_KEY_BASE64`: the Google service-account JSON encoded as a single Base64 string.

Share the target Google Doc with the service account's `client_email` and grant **Editor** access.

## Optional variable

Under **Settings > Secrets and variables > Actions > Variables**, add `OPENAI_MODEL` to override the workflow default.

## What happens after a merge

1. GitHub checks out the updated `main` branch.
2. Dependencies install and tests run.
3. The source files are sent to the OpenAI Responses API.
4. `README.md` and `API_DOCS.md` are regenerated from implemented behavior.
5. `API_DOCS.md` replaces the content in the configured Google Doc.
6. Changed Markdown files are committed back to `main` by `github-actions[bot]`.

The bot commit does not trigger another documentation run, preventing an infinite workflow loop.
