# AGENTS.md

## Repo layout

```
frontend/   React 19 + Vite SPA (all active code lives here)
backend/    Empty directory — no language or framework chosen yet
```

No root `package.json` or workspace orchestration. **All npm commands must be run from `frontend/`.**

---

## Developer commands (all from `frontend/`)

```bash
npm install          # install deps
npm run dev          # Vite dev server with HMR
npm run build        # tsc -b && vite build  (type-checks before bundling)
npm run lint         # eslint . (flat config, ESLint 9)
npm run preview      # serve the production build locally
npx tsc -b           # standalone type-check without building
```

No test runner, no format script, no CI pipelines configured.

---

## Key quirks

### TypeScript 6 strict flags
Both `tsconfig.app.json` and `tsconfig.node.json` enforce:
- `erasableSyntaxOnly: true` — **`enum` and `namespace` that emit JS are forbidden**; use `const enum` (inlined) or plain objects
- `verbatimModuleSyntax: true` — type-only imports must use `import type`
- `noUnusedLocals` / `noUnusedParameters: true`

### React Compiler (dual-plugin Vite setup)
`vite.config.ts` runs **two plugins simultaneously**:
1. `@vitejs/plugin-react` — JSX transform via Oxc + fast refresh
2. `@rolldown/plugin-babel` with `reactCompilerPreset()` — auto-memoization

Do not remove either plugin. The README notes this combination can slow dev/build.

### Tailwind v4 — CSS-first config
No `tailwind.config.js`. Configuration is done entirely in CSS:
```css
/* src/index.css */
@import "tailwindcss";
```
`@tailwindcss/vite` is listed as a dependency but **not yet wired into `vite.config.ts`** — Tailwind styles won't apply until that plugin is added to the `plugins` array.

### React 19
Project targets React 19. Avoid patterns or libraries that assume React 18 APIs.

---

## Entrypoint

`frontend/index.html` → `src/main.tsx` → `src/App.tsx`

Build output goes to `frontend/dist/` (gitignored).

---

## Backend (`backend/`)

Express 5 + TypeScript 5, CommonJS modules, Node 22.

### Developer commands (all from `backend/`)

```bash
npm install
npm run dev        # tsx watch src/index.ts  (no compile step)
npm run build      # tsc → dist/
npm start          # node dist/index.js
npm run typecheck  # tsc --noEmit
```

### Required environment variables

Copy `.env.example` to `.env` before starting. Required vars:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Full MongoDB connection string |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to Firebase Admin JSON key file |
| `GCP_PROJECT_ID` | GCP project ID |
| `GCP_BUCKET_NAME` | GCP Storage bucket name |

### Firebase Admin key

Place the downloaded service account JSON at the path set in
`FIREBASE_SERVICE_ACCOUNT_PATH` (default: `./service-account.json`).
It is gitignored. Both Firebase Admin **and** GCP Storage use this same
credential file — no separate GCP key is needed.

### Source layout

```
src/
  index.ts            # Express app, boots DB then listens
  types/
    express.d.ts      # Augments Express Request with req.user (DecodedIdToken)
  config/
    firebase.ts       # firebase-admin init, exports auth
    mongodb.ts        # mongoose.connect, exports connectDB()
    storage.ts        # @google-cloud/storage init, exports bucket + helpers
  middleware/
    auth.ts           # authenticate (required) / optionalAuthenticate
  routes/
    index.ts          # Mounts /health and /me; add new routers here
```

### Auth middleware usage

```typescript
import { authenticate } from "../middleware/auth.js";

router.get("/protected", authenticate, (req, res) => {
  // req.user is DecodedIdToken — uid, email, etc.
});
```

### GCP Storage helpers (from `config/storage.ts`)

```typescript
import { uploadFile, getSignedUrl, deleteFile, bucket } from "../config/storage.js";
```

- `uploadFile(buffer, destination, mimetype)` — saves to bucket, returns public URL
- `getSignedUrl(destination, expiresInMs?)` — generates a temporary read URL
- `deleteFile(destination)` — removes an object

### TypeScript quirk: env-var narrowing

Module-level `process.env` guards (e.g., `if (!X) throw`) do **not** narrow
the type inside async functions in the same module. Pattern used throughout:

```typescript
const raw = process.env.SOME_VAR;
if (!raw) throw new Error("SOME_VAR not set");
const SOME_VAR: string = raw; // stable type for use in closures
```
