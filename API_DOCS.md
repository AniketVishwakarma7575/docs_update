# API Documentation for docs_update branch

This document describes the current route definitions and payload formats for the branch code in `docs_update`.

## 1. Items CRUD

### POST /api/items

**Feature Owner**: Backend API

**Auth Required**: None (public endpoint)

**Rate Limit**: not enforced in this simple app

**Scope**: Basic item CRUD for frontend testing

#### Request Body

Content-Type: application/json

```json
{
  "name": "Example item",
  "description": "Optional details"
}
```

#### Request Fields

- `name` (string, required) — Item title, must be a non-empty string.
- `description` (string, optional) — Optional item details.

#### Success Response — 201 Created

```json
{
  "id": "<uuid>",
  "name": "Example item",
  "description": "Optional details",
  "createdAt": "2026-07-17T...Z",
  "updatedAt": "2026-07-17T...Z"
}
```

#### Key Response Fields

- `id` (string) — Unique item identifier.
- `name` (string) — Item title.
- `description` (string) — Item details.
- `createdAt` (string) — Timestamp when the item was created.
- `updatedAt` (string) — Timestamp when the item was last updated.

#### Error cases

- `400` — Invalid JSON body or missing `name`.

---

### GET /api/items

**Feature Owner**: Backend API

**Auth Required**: None

**Scope**: List items

#### Success Response — 200 OK

```json
[
  {
    "id": "<uuid>",
    "name": "Example item",
    "description": "Optional details",
    "createdAt": "2026-07-17T...Z",
    "updatedAt": "2026-07-17T...Z"
  }
]
```

#### Key Response Fields

- `id` (string) — Unique item identifier.
- `name` (string) — Item title.
- `description` (string) — Item details.
- `createdAt` (string) — Timestamp when the item was created.
- `updatedAt` (string) — Timestamp when the item was last updated.

#### Error cases

- none for a valid request.

---

### GET /api/items/:id

**Feature Owner**: Backend API

**Auth Required**: None

**Scope**: Fetch one item by ID

#### Path Parameters

- `id` (string) — item UUID

#### Success Response — 200 OK

```json
{
  "id": "<uuid>",
  "name": "Example item",
  "description": "Optional details",
  "createdAt": "2026-07-17T...Z",
  "updatedAt": "2026-07-17T...Z"
}
```

#### Error cases

- `404` — Item not found.

---

### PUT /api/items/:id

**Feature Owner**: Backend API

**Auth Required**: None

**Scope**: Update item fields

#### Request Body

```json
{
  "name": "Updated item",
  "description": "Updated details"
}
```

#### Request Fields

- `name` (string, required)
- `description` (string, optional)

#### Success Response — 200 OK

```json
{
  "id": "<uuid>",
  "name": "Updated item",
  "description": "Updated details",
  "createdAt": "2026-07-17T...Z",
  "updatedAt": "2026-07-17T...Z"
}
```

#### Error cases

- `400` — Invalid JSON body or missing `name`.
- `404` — Item not found.

---

### DELETE /api/items/:id

**Feature Owner**: Backend API

**Auth Required**: None

**Scope**: Remove an item

#### Path Parameters

- `id` (string) — item UUID

#### Success Response — 204 No Content

No body returned.

#### Error cases

- `404` — Item not found.

---

## Notes for tester

- Start the app with `npm install` and `npm start`.
- Verify the app in browser at `http://localhost:3000`.
- Use the frontend UI or curl to exercise the CRUD endpoints.
- This branch does not currently implement authentication or rate limiting.
