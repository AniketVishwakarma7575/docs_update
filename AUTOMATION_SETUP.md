# Automatic API documentation setup

When any pull request is merged into `main`, GitHub creates a push event on `main`. The workflow in `.github/workflows/ai-api-docs.yml` then:

1. checks out the latest `main` code;
2. installs dependencies and runs tests;
3. scans source and route files;
4. asks Gemini to regenerate `API_DOCS.md`;
5. replaces the configured Google Doc with styled API documentation;
6. commits the generated `API_DOCS.md` back to `main`.

The bot-generated Markdown commit does not trigger another documentation run.

## GitHub configuration

Open **Repository > Settings > Secrets and variables > Actions** and add these repository secrets:

- `GEMINI_API_KEY`: Gemini API key. Never commit this value.
- `GOOGLE_DOC_ID`: ID between `/d/` and `/edit` in the Google Docs URL.
- `GOOGLE_SA_KEY_BASE64`: Base64-encoded Google service-account JSON.

Share the target Google Doc with the service account `client_email` as **Editor**.

Under **Settings > Actions > General > Workflow permissions**, select **Read and write permissions** so the workflow can commit `API_DOCS.md`.

An optional Actions variable named `GEMINI_MODEL` can override the default `gemini-3.5-flash` model.

## Local test

Set the four environment variables locally and run:

```bash
npm test
npm run docs:ai-sync
```

Rotate any API key or JWT that has been pasted into chat, logs, source code, or issues.
