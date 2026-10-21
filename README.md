# PixieLearn

PixieLearn is a web-first AI learning workspace that turns PDF and document study into an interactive lesson. Pixie, the built-in AI tutor, helps learners understand what they are reading through explanations, visual highlights, quizzes, captions, and whiteboard diagrams.

> **Current status:** PixieLearn is an interface prototype focused on the core PDF learning experience. AI services, document ingestion, speech generation, and persistence are planned product layers.

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

The repository is organized as a web-first application. A future Electron companion can reuse the web interface while adding desktop capabilities such as always-on-top windows, screen capture, global shortcuts, and system-tray controls.

## Getting started

### Requirements

- Node.js compatible with the versions listed in `.mise.toml`
- npm

### Install dependencies

```bash
npm install
```

### Configure the backend

Copy `.env.example` to `.env.local` and set the backend origin when the API is available:

```bash
VITE_API_URL=http://localhost:3000/api
VITE_ENABLE_MOCK_AUTH=false
```

The frontend currently exposes a typed auth boundary for Better Auth. The backend should mount Better Auth at `/api/auth` and expose these standard endpoints:

```text
POST /api/auth/sign-in/email
POST /api/auth/sign-up/email
POST /api/auth/sign-in/social
POST /api/auth/request-password-reset
POST /api/auth/sign-out
GET  /api/auth/get-session
```

The frontend maps Better Auth's `{ user, session }` responses to the local `AuthUser` contract. Email/password and Google authentication should be configured in Better Auth on the backend. `GET /api/auth/get-session` should be used next to restore the session after a browser refresh.

Until `VITE_ENABLE_MOCK_AUTH=false` is set, the auth screens use a local demo service so the frontend remains runnable without a backend.

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
