# FolioForge

FolioForge is a local-first creative portfolio studio. It lets a user shape
their profile, projects, experience, visual style, and page flow in a live
builder, inspect the generated source, and download a runnable static website.

## Structure

```text
folioforge/
├── backend/     FastAPI persistence and asset API
└── frontend/    React + Vite builder and live portfolio preview
```

## Run the complete project

### Terminal 1 — backend

```bash
cd folioforge/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Terminal 2 — frontend

```bash
cd folioforge/frontend
npm install
cp .env.example .env
npm run dev
```

Open the Vite URL shown in the terminal. The frontend works without the API;
with `VITE_API_URL=http://localhost:8000`, project saves and image uploads are
also sent to the backend.

## What is included

- Creative dashboard and starter template library
- Basics/content/design/export builder workflow
- Live responsive portfolio preview
- Local-first autosave and saved drafts
- Template switching, page-flow visibility, and section ordering
- Portfolio project and experience editors
- Image upload support
- Local command editor for safe structured changes
- Generated source-code workspace
- Static ZIP and JSON exports
- FastAPI backend with in-memory development storage and optional MongoDB

The backend intentionally reports missing AI or deployment integrations rather
than pretending those providers are configured. Add those integrations behind
real server-side provider credentials when needed.
