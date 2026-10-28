# PixieLearn

PixieLearn is a web-first AI learning workspace that turns PDF and document study into an interactive lesson. Pixie, the built-in AI tutor, helps learners understand what they are reading through explanations, visual highlights, quizzes, captions, and whiteboard diagrams.

> **Current status:** PixieLearn includes Better Auth sign-in and a private PDF/PPTX document library backed by PostgreSQL and S3-compatible object storage. Document rendering, conversion, OCR, and AI lesson workflows are being added in later stories.

## Highlights

- **Guided document lessons** with page-based progress and previous/next navigation.
- **In-document search** with Page or All-document scope, match counts, navigation, and highlighted results.
- **Pixie teaching panel** with a resizable layout, mute/unmute control, contextual actions, and lesson prompts.
- **Interactive learning tools** including quizzes, answer feedback, whiteboard explanations, and lesson actions.
- **Shared captions** in the main workspace and floating tutor, with contrast and transparency controls.
- **Floating tutor mode** with a compact chat surface, persistent lesson controls, minimize/restore behavior, and an exit control.
- **Light and neutral themes** built around charcoal, grey, black, ivory, and gold accents.
- **Settings workspace** covering the AI teacher, audio, captions, appearance, documents, privacy, desktop companion, account, and support.

## Tech stack

- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- Oxfmt

The project uses Tailwind CSS and semantic custom CSS together. Tailwind handles simple layout and responsive utilities, while custom CSS defines the PixieLearn theme and complex learning surfaces.

## Project structure

```text
.
├── apps/
│   └── web/
│       ├── public/
│       ├── src/
│       │   ├── app/
│       │   │   └── App.tsx
│       │   ├── components/
│       │   │   ├── Icon.tsx
│       │   │   ├── PublicPages.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   ├── Learning.tsx
│       │   │   ├── Settings.tsx
│       │   │   └── Floating.tsx
│       │   ├── index.css
│       │   ├── main.tsx
│       │   └── vite-env.d.ts
│       ├── index.html
│       └── vite.config.ts
├── package.json
└── tsconfig.json
```

The backend is split by responsibility: `services/auth` runs Better Auth on Node.js, and `services/api` runs product endpoints on FastAPI. Both services use the same local PostgreSQL database; Better Auth owns its auth tables, and the API validates sessions through Better Auth's session endpoint.

Tests live beside their code: frontend tests are under `apps/web/src`, FastAPI tests are under `services/api/tests`, and Better Auth service tests are under `services/auth/test`.

The repository is organized as a web-first application. A future Electron companion can reuse the web interface while adding desktop capabilities such as always-on-top windows, screen capture, global shortcuts, and system-tray controls.

## Getting started

### Requirements

- Node.js compatible with the versions listed in `.mise.toml`
- npm

### Install dependencies

```bash
npm install
```

### Start the backend services

Copy each example environment file and create a Better Auth secret:

```bash
cp .env.example .env.local
cp services/auth/.env.example services/auth/.env
cp services/api/.env.example services/api/.env
```

Point `services/auth/.env` and `services/api/.env` at the same database host, name, and credentials. The API URL uses SQLAlchemy's `postgresql+psycopg://` scheme as shown in its example. Replace `BETTER_AUTH_SECRET` with a private random value of at least 32 characters. Google sign-in is enabled when both Google credentials are set. Email/password auth and session restoration work without them.

Start PostgreSQL and MinIO, apply the Better Auth and product API schemas, then start the services:

```bash
docker compose up -d postgres minio minio-public
cd services/auth
npm install
npm run db:migrate
cd ../api
python -m pip install -e "[dev]"
alembic upgrade head
```

In separate terminals, start the services:

```bash
cd services/auth && npm run dev
```

```bash
cd services/api
python -m venv .venv
# Activate the environment, then:
python -m pip install -e .
python -m uvicorn app.main:app --reload --port 8000
```

Set `VITE_ENABLE_MOCK_AUTH=false` in `.env.local` to use real auth. The Vite server proxies `/api/auth/*` to Better Auth on port `3001` and `/api/*` to FastAPI on port `8000`. Keep `VITE_API_URL=/api` for same-origin requests and cookies.

FastAPI's `GET /api/me` forwards the incoming Better Auth session cookie to `GET /api/auth/get-session`; it does not read or write Better Auth tables. Missing or expired sessions return `401` with an `UNAUTHENTICATED` error code.

The document API stores file metadata in PostgreSQL and originals in a private MinIO bucket. `services/api/.env.example` contains local database and storage settings. The API creates the development bucket on first upload. Signed URLs expire after five minutes. Local browser downloads use the MinIO proxy on port `9100` to add the frontend CORS headers; set `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL` to the browser-accessible object-store or proxy address. Set `OBJECT_STORAGE_CREATE_BUCKET_IF_MISSING=false` in deployment and provision the bucket separately. Deployment buckets must allow `GET` from the configured frontend origin through S3 CORS. Future document and learning routes must keep database lookups scoped to both the resource ID and authenticated owner ID.

Future document and learning routes must use the authenticated `AuthUser` and enforce resource ownership with the API ownership check. Query persisted resources by both their ID and owner ID, and return a generic `404` when the resource is missing or belongs to another user.

The frontend restores the session at startup. With mock auth enabled, the demo session is stored in `sessionStorage` so refresh works for the current browser tab.

### Frontend only

The app remains usable without backend services. Copy `.env.example` to `.env.local`, leave `VITE_ENABLE_MOCK_AUTH=true`, and start the frontend:
```

### Start the development server

```bash
npm run dev
```

The Vite development server runs on port `8443` by default. Open the displayed local URL in a browser.

### Create a production build

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

### Format the code

```bash
npm run format
```

### Run tests

Install the API development dependencies once, then run the repository test command:

```bash
python -m pip install -e "services/api[dev]"
npm test
```

`npm test` runs the frontend unit tests, FastAPI tests, and Better Auth service tests. The Better Auth unit tests validate configuration without requiring PostgreSQL. End-to-end auth tests that need PostgreSQL should be run separately with the local services configured.

## Validation

Run the TypeScript project check and production build before submitting changes:

```bash
npx tsc -b
npm run build
```

The build may report non-blocking Vite warnings about future native config loading behavior. These do not currently prevent the application from building.

## Product direction

PixieLearn is being developed in stages:

1. **Web foundation** — establish the browser-based learning workspace.
2. **PDF Teacher MVP** — connect document ingestion, source-grounded explanations, speech, and lesson state.
3. **Electron companion beta** — add permissioned screen capture, always-on-top floating support, and global shortcuts.
4. **Guided computer workflows** — expand toward screen-aware help while keeping permissions and user control explicit.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development conventions, validation steps, and pull request expectations.

## Privacy direction

Privacy is part of the product design. Screen capture and desktop companion features are planned to be permissioned, clearly indicated, user-controlled, and supported by data deletion and retention controls.

## License

This project is currently private and does not yet publish a license for redistribution.
