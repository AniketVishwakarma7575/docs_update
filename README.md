# Node CRUD App

A small Node.js CRUD app with a REST API, browser UI, and JSON-file storage.

The app also includes Multer-based file uploads. Uploaded files are stored in `uploads/` and are limited to 5 MB each.

## Run it

```bash
npm start
```

Open <http://localhost:3000>.

For automatic server restarts during development (Node.js 18+):

```bash
npm run dev
```

## API

- `GET /api/items` — list items
- `GET /api/items/:id` — get one item
- `POST /api/items` — create an item
- `PUT /api/items/:id` — update an item
- `DELETE /api/items/:id` — delete an item

### File upload API

- `POST /api/uploads` — upload one file using multipart field `file`
- `GET /api/uploads` — list uploaded files
- `GET /api/uploads/:filename` — download a file
- `DELETE /api/uploads/:filename` — delete a file

Allowed file types: JPG, PNG, GIF, PDF, and TXT. Maximum file size: 5 MB.

Create/update JSON body:

```json
{ "name": "Example", "description": "Optional details" }
```
# docs_update
