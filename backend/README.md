# FolioForge backend

FastAPI service for FolioForge's portfolio builder. It provides validated
portfolio-project persistence, template metadata, image uploads, and JSON
export.

## Run locally

From this directory:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

The default development mode uses an in-memory repository, so no database is
required. Projects last for the lifetime of the process. For durable storage,
set `MONGODB_URL` and install the dependencies from `requirements.txt`; the
application will verify the MongoDB connection during startup instead of
silently falling back to memory.

The API is available at `http://localhost:8000`:

- `GET /api/health` — service and storage status
- `GET /api/templates` — supported portfolio templates
- `GET|POST /api/projects` — list or create projects
- `GET|PATCH|DELETE /api/projects/{id}` — manage one project
- `POST /api/projects/{id}/duplicate` — duplicate a project
- `GET /api/projects/{id}/export` — download normalized JSON
- `POST /api/uploads` — upload a JPEG, PNG, WebP, or GIF image
- `GET /docs` — FastAPI Swagger UI

Pass `X-User-Id` to scope projects to a user. If it is omitted, the API uses
`local-user`, which is convenient for the unauthenticated local builder.

## Frontend integration

The builder can use the API with a small client such as:

```js
const response = await fetch('http://localhost:8000/api/projects', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-User-Id': 'local-user',
  },
  body: JSON.stringify({ name: 'My portfolio', config }),
});

const project = await response.json();
```

This backend does not pretend to provide an AI model or deployment provider.
Those integrations should be added behind authenticated server-side adapters
when their credentials and provider contracts are available.

## Checks

```bash
PYTHONPATH=. pytest -q
python -m compileall app main.py
```
