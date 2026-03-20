# InternSave

InternSave is a personal Chrome extension MVP for saving and tracking internship applications in one place.

## 1. MVP Summary

This project is intentionally small and demo-friendly:
- Add internship applications from a Chrome popup
- AI Autofill form fields from the current open job page (local Ollama)
- View saved applications in the popup
- Update status and notes
- Delete applications
- Store data through a backend REST API
- Use PostgreSQL on Vultr for cloud database hosting

Out of scope by design:
- No scraping automation
- No login/signup
- No API keys
- No multi-user system
- No analytics

## 2. Architecture And Repo Structure

### Architecture

Chrome Extension Popup (HTML/CSS/JS)
-> Current Page Extraction (content script injection)
-> Local Ollama AI (http://127.0.0.1:11434)
-> Express REST API (Node.js)
-> Prisma ORM
-> PostgreSQL (Vultr)

### Repo Structure

```text
internsave/
  backend/
    prisma/
      schema.prisma
    src/
      db.js
      server.js
      routes/
        applications.js
    .env.example
    package.json
  extension/
    manifest.json
    src/
      popup.html
      popup.css
      popup.js
      pageExtractor.js
  README.md
```

## 3. Main Files Created

Backend:
- `backend/package.json`: scripts and dependencies
- `backend/prisma/schema.prisma`: data model + enums
- `backend/src/server.js`: API server setup
- `backend/src/routes/applications.js`: CRUD endpoints
- `backend/src/db.js`: Prisma client instance
- `backend/.env.example`: environment template

Extension:
- `extension/manifest.json`: extension configuration
- `extension/src/popup.html`: popup UI layout
- `extension/src/popup.css`: popup styling
- `extension/src/popup.js`: popup CRUD logic + backend calls + AI autofill
- `extension/src/pageExtractor.js`: current-page data extraction helper for AI autofill

Project:
- `.gitignore`
- `README.md`

## 4. Data Model

Each internship application stores:
- `employer`
- `title`
- `location`
- `applied_at`
- `status`
- `platform`
- `job_url`
- `notes`

Status values:
- `Saved`
- `Applied`
- `OA`
- `Interview`
- `Rejected`
- `Offer`

Platform values:
- `Handshake`
- `LinkedIn`
- `Indeed`
- `Other`

## 5. API Endpoints (MVP CRUD)

- `GET /health`
- `GET /api/applications`
- `GET /api/applications/:id`
- `POST /api/applications`
- `PATCH /api/applications/:id`
- `DELETE /api/applications/:id`

Example create payload:

```json
{
  "employer": "Acme Corp",
  "title": "Software Engineering Intern",
  "location": "San Francisco, CA",
  "applied_at": "2026-03-20T00:00:00.000Z",
  "status": "Applied",
  "platform": "LinkedIn",
  "job_url": "https://example.com/job/123",
  "notes": "Referral from classmate"
}
```

## 6. Run The Project

### Backend

```bash
cd backend
npm install
cp .env.example .env
# update DATABASE_URL with your Vultr PostgreSQL connection string
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

Backend default URL:
- `http://localhost:3000`

### Extension

Optional local AI setup for Autofill:

```bash
# install Ollama from https://ollama.com/
ollama serve
ollama pull qwen2.5:3b
```

If Ollama is not running, the extension still works for normal CRUD and backend operations.

1. Open Chrome and go to `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `extension` folder
5. Open the extension popup
6. Click `Backend` to set API URL if needed
7. Click `Add Application` and then `AI Autofill` on a job page to prefill fields

## 7. AI Autofill Behavior (MVP)

- The button reads only the current active tab page
- The extension extracts title, meta tags, headings, visible text, structured `JobPosting`, and URL
- A compact page summary is sent to local Ollama (no OpenAI dependency)
- AI returns strict JSON for these fields:
  - `employer`
  - `title`
  - `location`
  - `applied_at`
  - `status`
  - `platform`
  - `job_url`
  - `notes`
- Field rules:
  - `status` is always `Saved`
  - `applied_at` stays blank
  - `job_url` uses current tab URL
  - `platform` is inferred from hostname (`Handshake`, `LinkedIn`, `Indeed`, `Other`)
  - unclear values are left as empty strings
- Nothing is auto-saved; user reviews/edits and then clicks Save
- If page analysis or Ollama fails, a clear error message is shown

## 8. Demo Flow

1. Start backend
2. Open extension popup
3. Click `Add Application`
4. Optionally click `AI Autofill` to prefill from the current job page
5. Review and edit fields as needed
6. Save application
7. Edit status/notes
8. Delete an entry

This is enough for a realistic student MVP demo and portfolio challenge submission.
