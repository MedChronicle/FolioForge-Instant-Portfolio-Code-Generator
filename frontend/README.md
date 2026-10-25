# FolioForge frontend

React + Vite studio for creating, previewing, editing, and exporting personal
portfolio websites.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

The frontend runs on the Vite URL printed in the terminal, normally
`http://localhost:5173`.

Set `VITE_API_URL=http://localhost:8000` to sync projects and image uploads to
the FastAPI backend. Without it, drafts are stored in `localStorage`, so the
builder still works offline.

## Main flows

- Dashboard with saved local drafts and template starters
- Four-step builder for basics, content, design, and export
- Live desktop, tablet, and mobile preview
- Safe local edit commands for common design changes
- Generated source workspace with `index.html`, `styles.css`, `app.js`, and JSON data
- Runnable static ZIP export using JSZip
