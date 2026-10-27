# Contributing to PixieLearn

Thank you for helping improve PixieLearn. The project is a React and Vite prototype for a web-first AI learning workspace.

## Before you start

1. Install a supported Node.js version from `.mise.toml`.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

The app runs on port `8443` by default. You can override it with the `PORT` environment variable.

## Project conventions

- Keep product UI inside `apps/web/src`.
- Put reusable UI in `apps/web/src/components`.
- Keep public/authentication screens in `PublicPages.tsx`, navigation in `Sidebar.tsx`, learning surfaces in `Learning.tsx`, preferences in `Settings.tsx`, and floating-mode behavior in `Floating.tsx`.
- Keep feature-specific state and behavior close to its feature.
- Prefer small components with typed props over large components with implicit state.
- Use existing CSS variables and component styles before adding new visual tokens.
- Follow the hybrid styling strategy: use Tailwind for simple layout and responsive utilities, and custom CSS for PixieLearn's theme, branded visuals, document surfaces, captions, and tutor states.
- Preserve the neutral charcoal/grey visual system and light theme.
- Use accessible labels for icon-only controls and semantic buttons for actions.
- Do not add real credentials, API keys, or local environment files to the repository.
- Use `.env.example` to document frontend environment variables; keep `.env.local` untracked.

## Validation

Run these commands before opening a pull request:

```bash
npx tsc -b
npm run build
npm run format
```

If formatting changes files, include the formatted result in your contribution.

## Making changes

1. Create a focused branch from `main`.
2. Make one logical change at a time.
3. Add or update documentation when behavior or project structure changes.
4. Test the affected flow in the browser, including both dark and light themes when styling changes.
5. Check the landing, login, signup, and authenticated workspace paths when changing navigation or auth UI.

## Pull requests

Pull requests should include:

- A short explanation of the problem and solution.
- Screenshots or a short recording for visible UI changes.
- Validation commands and their results.
- Any known limitations, especially where a UI prototype still needs backend integration.
