# PixieLearn

PixieLearn is a visual, source-grounded AI learning workspace where learners and an AI tutor think together over documents and a shared whiteboard. Point to a page or passage, sketch your understanding on the whiteboard, and get a visual, document-grounded response from Meta's `muse-spark-1.3` model with verifiable citations, PDF highlights, whiteboard annotations, and comprehension quizzes.

> **Current status:** PixieLearn includes Better Auth sign-in, a private PDF/PPTX document library backed by PostgreSQL and S3-compatible object storage, asynchronous PPTX conversion and Tesseract OCR via a Redis worker, and a multimodal AI tutor powered by Meta Model API (`muse-spark-1.3` and `muse-voice-transcribe-1.0`).

## Meta Global AI Developer Hackathon Disclosure

Per hackathon rules, this section distinguishes **what was built during the hackathon** from **pre-existing baseline work**:

### Built During the Hackathon (Meta-Powered Visual & Voice Tutor)
- **Meta Multimodal Tutor (`muse-spark-1.3` via `https://api.meta.ai/v1/responses`):** Server-side `MetaResponsesQuestionProvider` (`services/api/app/meta_responses_question_provider.py`) sends bounded page/selection context, conversation history, tutor intent, and learner whiteboard snapshots (`input_image`) to `muse-spark-1.3`, returning schema-validated JSON (`QuestionAnswer`).
- **Whiteboard Sketch Evaluation ("Ask Pixie about my drawing"):** Captures the learner's SVG strokes into a bounded raster snapshot (`apps/web/src/features/questions/whiteboardSnapshot.ts`) and sends it alongside the active page or selected passage so Pixie can compare the learner's visual reasoning with the source text, identify what matches vs. what is uncertain, and ask clarifying questions without treating learner marks as source evidence.
- **Source-Verified Visual & Quiz Action Proposals:** Validates every citation and proposed action against the active page's extracted text and word-span IDs (`services/api/app/routers/questions.py`):
  - `pdf_highlight`: Verbatim quote and word-span IDs that highlight directly on the rendered PDF page overlay when applied.
  - `whiteboard_label`: Source-grounded annotation placed at normalized `(x, y)` coordinates on the learner's whiteboard, with apply/dismiss/restore/undo controls.
  - `quiz`: Structured multiple-choice comprehension check (`question`, `options`, `correctIndex`, `explanation`) rendered in the interactive `QuizModal` with source evidence citations.
- **Iterative Learner-Pixie-Learner Loop:** Grounded typed and spoken questions, `Repeat`, `Simpler`, `Go deeper`, and `Quiz me` intents (`services/api/app/question_answer.py`), in-flight cancellation (`Stop response`), retry without losing input, and PostgreSQL persistence of turns, citations, and actions (`alembic/versions/0009_add_learning_questions.py`, `0010_add_learning_question_actions.py`).
- **Meta Voice Input (`muse-voice-transcribe-1.0`) & Speech Synthesis:** Client-side `VoiceTurnDetector` and 24 kHz mono PCM WAV encoder (`apps/web/src/features/questions/voiceAudio.ts`) paired with `POST /api/documents/{id}/voice/transcribe` (`https://api.meta.ai/v1/asr/transcribe`) and `GET /api/documents/{id}/questions/{question_id}/audio` (`services/api/app/routers/voice.py`).

### Pre-Existing Product Baseline
- Better Auth authentication service (`services/auth`), private PDF/PPTX upload library, MinIO storage, and Redis/LibreOffice/Tesseract page-text + word-box extraction worker.
- Base PDF.js document viewer with selectable word-box overlay, zoom/page navigation, and in-document search.
- Base whiteboard drawing canvas and Mermaid figure viewer, Learning/Workspace mode switch (`WorkspaceCanvas.tsx` source-card MVP), Floating tutor shell, and user settings panel.

## Highlights

- **Multimodal whiteboard + document tutoring** powered by Meta `muse-spark-1.3`.
- **Source-verified citations & visual actions** (`pdf_highlight`, `whiteboard_label`, and `quiz`) checked against extracted page text and word-span coordinates.
- **Voice conversation & transcription** using Meta `muse-voice-transcribe-1.0` with automatic silence turn detection and spoken tutor explanations.
- **Guided document lessons** with page-based progress, passage selection, and previous/next navigation.
- **In-document search** with Page or All-document scope, match counts, navigation, and highlighted results.
- **Shared live captions** in the main workspace and floating tutor, with contrast and transparency controls.
- **Two-mode workspace** combining focused single-document **Learning mode** with a multi-source **Workspace canvas** MVP for organizing PDFs and pinned links.
- **Settings workspace** covering the AI teacher, audio, captions, appearance, documents, privacy, desktop companion, account, and support.

## Tech stack

- **Frontend:** React 19, TypeScript 5.7, Vite 8, Tailwind CSS v4, PDF.js, Mermaid, Vitest
- **Backend API:** Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, HTTPX, Pytest
- **AI Models:** Meta `muse-spark-1.3` (Responses API), Meta `muse-voice-transcribe-1.0` (ASR API), optional Gemini TTS (`gemini-3.8-flash-tts`) / OpenAI-compatible fallback
- **Auth & Infrastructure:** Node.js, Better Auth, PostgreSQL 17, Redis 7 + RQ, MinIO (S3-compatible storage), LibreOffice, Tesseract OCR

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
│       │   │   ├── Floating.tsx
│       │   │   ├── Icon.tsx
│       │   │   ├── Learning.tsx
│       │   │   ├── PublicPages.tsx
│       │   │   ├── Settings.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   └── WorkspaceCanvas.tsx
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   ├── documents/
│       │   │   ├── questions/
│       │   │   └── settings/
│       │   ├── lib/
│       │   ├── index.css
│       │   └── main.tsx
│       ├── index.html
│       └── vite.config.ts
├── services/
│   ├── api/
│   │   ├── alembic/
│   │   ├── app/
│   │   │   ├── meta_responses_question_provider.py
│   │   │   ├── learning_context.py
│   │   │   ├── question_answer.py
│   │   │   ├── routers/
│   │   │   │   ├── documents.py
│   │   │   │   ├── questions.py
│   │   │   │   ├── settings.py
│   │   │   │   └── voice.py
│   │   │   └── schemas/
│   │   └── tests/
│   └── auth/
├── compose.yaml
├── package.json
└── vitest.config.ts
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

Start PostgreSQL, MinIO, Redis, and the LibreOffice document worker, apply the Better Auth and product API schemas, then start the services:

```bash
docker compose up -d --build postgres minio minio-public redis document-worker
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

Better Auth trusts the frontend origins listed in `services/auth/.env` as `FRONTEND_URLS`, a comma-separated list (for example, `http://localhost:8443,http://192.168.1.100:8443` for local and LAN development). Configure the exact scheme, host, and port used in the browser; do not use a wildcard origin. `FRONTEND_URL` remains supported as a legacy single-origin setting.

FastAPI's `GET /api/me` forwards the incoming Better Auth session cookie to `GET /api/auth/get-session`; it does not read or write Better Auth tables. Missing or expired sessions return `401` with an `UNAUTHENTICATED` error code.

### Configure AI Tutor & Voice Providers (`services/api/.env`)

Configure your Meta Model API credentials on the backend server in `services/api/.env` (never expose API keys in frontend `.env.local` files):

```env
# Meta Model API — powers multimodal tutor Q&A, whiteboard feedback, quizzes, and voice ASR
META_MODEL_API_KEY=your-meta-model-api-key
META_MODEL=muse-spark-1.3

# Optional: Gemini TTS for speaking saved tutor answers (falls back to browser Web Speech API)
GEMINI_API_KEY=your-gemini-api-key
GEMINI_TTS_MODEL=gemini-3.8-flash-tts

# Optional: Custom OpenAI-compatible chat-completions override
AI_CHAT_COMPLETIONS_URL=
AI_API_KEY=
AI_MODEL=
AI_REQUEST_TIMEOUT_SECONDS=30
```

- **Grounded Q&A & Visual Feedback (`POST /api/documents/{id}/questions`):** When the learner asks a question, clicks `Repeat` / `Simpler` / `Go deeper` / `Quiz me`, or clicks `Ask Pixie about my drawing`, the API snapshots the selected passage (or bounded text from the current page) and forwards it with any whiteboard image snapshot (`data:image/jpeg;base64,...` or `data:image/png;base64,...`, up to 1 MiB) to `MetaResponsesQuestionProvider` (`muse-spark-1.3`). Every returned citation quote, `pdf_highlight`, `whiteboard_label`, and `quiz` action is verified against the active page context before being persisted in PostgreSQL.
- **Voice Questions (`POST /api/documents/{id}/voice/transcribe`):** Validates mono 24 kHz 16-bit PCM WAV audio on the server and forwards it to Meta's `muse-voice-transcribe-1.0` ASR endpoint.
- **Spoken Answers (`GET /api/documents/{id}/questions/{question_id}/audio`):** Synthesizes WAV speech for completed tutor answers when `GEMINI_API_KEY` is configured, with automatic fallback to browser speech synthesis.

The document API stores file metadata and per-page text geometry in PostgreSQL and originals and renditions in a private MinIO bucket. `services/api/.env.example` contains local database, Redis, and storage settings. Local Vite proxy targets and the API's Better Auth target use `127.0.0.1` to avoid Windows `localhost` IPv6 fallback delays; Vite loads these settings from `.env.local`. The API creates the development bucket on first upload. PPTX conversion, page text extraction, and OCR for scanned pages run asynchronously in the Compose worker using headless LibreOffice and Tesseract. Processing status, page count, and retry actions are available in the library; processed page text is available from owner-protected page-text endpoints. Owners can delete documents with `DELETE /api/documents/{id}`; incomplete object cleanup leaves a retryable deleting record. The learning-PDF endpoint supports HTTP byte ranges for PDF.js, and the viewer's zoom and selectable-text overlay stay aligned so learners can send a passage and page context to Pixie. Signed URLs expire after five minutes. Local browser downloads use the MinIO proxy on port `9100` to add the frontend CORS headers; set `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL` to the browser-accessible object-store or proxy address. Set `OBJECT_STORAGE_CREATE_BUCKET_IF_MISSING=false` in deployment and provision the bucket separately. Deployment buckets must allow `GET` from the configured frontend origin through S3 CORS. Future document and learning routes must keep database lookups scoped to both the resource ID and authenticated owner ID.

Use `GET /api/documents/{id}/pages/{page_index}/text` to read one processed page. The response contains page dimensions, assembled text, and word spans with stable page-local IDs, `native` or `ocr` source, and normalized top-left-origin bounding boxes (`x`, `y`, `width`, `height` from 0 to 1). OCR confidence is a 0–100 score; native spans have no confidence value. Only pages without extractable words are OCRed. The learning workspace loads the private PDF through `GET /api/documents/{id}/learning-pdf`, which serves a PDF original or PPTX rendition after checking ownership. `DOCUMENT_OCR_LANGUAGE` defaults to `eng`; install the matching `tesseract-ocr-<language>` package in the worker image when changing languages. Older documents are marked for processing retry by the migration and can be reprocessed from their library detail panel.

Future document and learning routes must use the authenticated `AuthUser` and enforce resource ownership with the API ownership check. Query persisted resources by both their ID and owner ID, and return a generic `404` when the resource is missing or belongs to another user.

The frontend restores the session at startup. With mock auth enabled, the demo session is stored in `sessionStorage` so refresh works for the current browser tab.

### Frontend demo mode

The UI can also be previewed in static demo mode without backend services. Copy `.env.example` to `.env.local`, leave `VITE_ENABLE_MOCK_AUTH=true`, and start the frontend:

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

Open source under the MIT License for the Meta Global AI Developer Hackathon.
