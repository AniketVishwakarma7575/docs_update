# Node CRUD App

A small dependency-free Node.js CRUD app with a REST API, browser UI, and JSON-file storage.

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

Create/update JSON body:

```json
{ "name": "Example", "description": "Optional details" }
```
# docs_update
