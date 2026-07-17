# Node CRUD App

A small dependency-free Node.js CRUD app with a REST API, browser UI, and JSON-file storage.

This branch includes updated developer docs for running and testing the application from a frontend/browser.

## Run it locally

1. Install dependencies:

```bash
npm install
```

2. Start the application:

```bash
npm start
```

3. Open the browser at:

```
http://localhost:3000
```

If you want automatic restarts during development, use:

```bash
npm run dev
```

## What it provides

- A browser-based frontend served from `public/`
- A backend REST API that stores items in `data/items.json`
- No database is required; data is persisted to disk

## API Endpoints

- `GET /api/items` — list all items
- `GET /api/items/:id` — get one item
- `POST /api/items` — create an item
- `PUT /api/items/:id` — update an item
- `DELETE /api/items/:id` — delete an item

Request body for create/update:

```json
{
  "name": "Example item",
  "description": "Optional details"
}
```

## Frontend testing

1. Open the app in a browser at `http://localhost:3000`.
2. Use the UI to create a new item. The frontend will send a `POST /api/items` request.
3. Confirm the item appears in the list.
4. Click an item to update or delete it; the UI will call `PUT /api/items/:id` or `DELETE /api/items/:id`.
5. Refresh the page to verify persistence.

## API testing via curl

Create an item:

```bash
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Test item","description":"Created from curl"}'
```

List items:

```bash
curl http://localhost:3000/api/items
```

Update an item:

```bash
curl -X PUT http://localhost:3000/api/items/<id> \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated item","description":"New description"}'
```

Delete an item:

```bash
curl -X DELETE http://localhost:3000/api/items/<id>
```

## Notes

- The application uses file-backed storage in `data/items.json`.
- If the file does not exist, it is created automatically.
- The app is suitable for frontend testing and basic local demos.
