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

### Product CRUD API

- `GET /api/products` — list all products
- `GET /api/products/:id` — get one product
- `POST /api/products` — create a product
- `PUT /api/products/:id` — replace a product
- `DELETE /api/products/:id` — delete a product

Create or update body:

```json
{
  "name": "Laptop",
  "description": "Work machine",
  "price": 999.5,
  "stock": 4
}
```

`name` is required, `price` must be a non-negative number, and `stock` must be a non-negative integer.

Create/update JSON body:

```json
{ "name": "Example", "description": "Optional details" }
```
# docs_update
