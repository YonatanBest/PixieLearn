pixielearn-design
React + Vite + Tailwind CSS project.

Development Server
Run `npm run dev` to start the Vite development server. It uses `$PORT` when provided and defaults to `8443`.
Project Structure
This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

apps/web/src/main.tsx - React entrypoint; imports apps/web/src/index.css and mounts apps/web/src/app/App.tsx into the #root element
apps/web/src/app/App.tsx - Application composition and authenticated workspace state
apps/web/src/components/Icon.tsx - Shared icon and button primitives
apps/web/src/components/PublicPages.tsx - Public landing, login, and signup screens
apps/web/src/components/Sidebar.tsx - Authenticated navigation and account controls
apps/web/src/components/Learning.tsx - Document, teacher, quiz, whiteboard, home, and workspace surfaces
apps/web/src/components/Settings.tsx - Settings and privacy screen
apps/web/src/components/Floating.tsx - Floating tutor companion surface
apps/web/src/features/auth/ - Typed authentication contracts and service adapters
apps/web/src/lib/api/ - Shared backend request client and API errors
apps/web/src/lib/config.ts - Environment-driven frontend configuration
apps/web/src/index.css - Global CSS entrypoint and Tailwind CSS v4 import
apps/web/index.html - Vite HTML shell containing the #root element and loading src/main.tsx
package.json - Project dependencies and the Vite build, development, preview, and formatting scripts
apps/web/vite.config.ts - Standard Vite configuration with React, Tailwind CSS v4, and the @ alias for apps/web/src
vitest.config.ts - Frontend unit-test configuration
apps/web/src/features/auth/service.test.ts - Frontend auth session tests
apps/web/src/lib/api/client.test.ts - Shared API client tests
services/api/tests/ - FastAPI route and authentication-boundary tests
services/auth/test/ - Better Auth service tests
.mise.toml - Toolchain versions for Node.js and pnpm
Dependencies
Runtime: React 19 and React DOM 19
Styling: Tailwind CSS v4 with the @tailwindcss/vite plugin
Build tooling: Vite 8, TypeScript 5.7, and @vitejs/plugin-react
Formatting: oxfmt
Styling
This project uses Tailwind CSS v4 through the @tailwindcss/vite plugin configured in apps/web/vite.config.ts. apps/web/src/index.css imports Tailwind with @import 'tailwindcss';. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in apps/web/src/index.css. This project does not need a Tailwind config file or PostCSS config.

apps/web/src/main.tsx imports apps/web/src/index.css, so global font wiring belongs in apps/web/src/index.css. Keep CSS @import statements first, then add any @font-face rules and font-family defaults there.

Styling approach
Use a hybrid styling strategy:

- Use Tailwind utilities for straightforward layout, spacing, sizing, alignment, and responsive behavior.
- Use semantic custom classes in apps/web/src/index.css for PixieLearn theme tokens, complex document and whiteboard visuals, branded previews, floating tutor surfaces, captions, and reusable component states.
- Prefer existing CSS variables and custom classes for product-specific colors and visual details instead of creating one-off utility values.
- Do not rewrite stable custom CSS into Tailwind only for the sake of migration. Introduce utilities incrementally when touching a component.
- Avoid duplicating the same rule in both Tailwind and custom CSS unless the utility is a responsive or structural enhancement.

Code quality
Use double quotes for strings containing apostrophes ("We're here to help"), or escape them in single-quoted strings. An unescaped apostrophe in a single-quoted string breaks the build.
Ensure JSX tags are closed and braces are balanced.
Export components as default exports.

Component organization
Keep new screens and reusable controls out of App.tsx when they have their own behavior or can be reused. Prefer focused files under apps/web/src/components or a feature folder. App.tsx should compose application state and top-level routes rather than contain every screen implementation.

Commits
- Use Conventional Commit messages in the format `<type>: <short description>`.
- Choose a type that matches the change, such as `feat`, `fix`, `docs`, `test`, `refactor`, or `chore`.
- Keep the description concise, specific, and imperative; do not end it with a period.
- Examples: `feat: add document upload`, `fix: restore auth session`, `docs: clarify local setup`.

Testing
- Write tests for new behavior and bug fixes. Keep tests close to the package or feature they cover.
- Make each test read as a small story: set up the inputs, perform one action, and assert the observable result.
- Prefer repeating short, clear setup in each test over sharing mutable objects, fixtures, or state between tests. Every test should own the objects it changes.
- Avoid opaque helper layers and large test factories. Use a helper only when it removes meaningful complexity without hiding the behavior under test.
- Use concrete names and values. Make important inputs and expected outputs visible in the test itself.
- Keep each test focused on one behavior; split unrelated assertions into separate tests.
- Do not depend on test execution order. Reset mocks, environment values, storage, and app state between tests.
- Test public behavior at the boundary first. Mock external services, not the code path whose behavior the test is meant to verify.
- Keep tests deterministic: no real network calls, real credentials, or required external services unless the test is explicitly marked as an integration test.
- Run the relevant package tests and the repository test command before completing a change.
