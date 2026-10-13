# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run inst          # Install deps (uses npm ci --ignore-scripts — do NOT use npm install)
npm run dev           # Run the client in dev mode with hot reload (there is no game server)
npm run start:server  # Serve the production build (static file server)
npm test              # Run all tests (Vitest)
npm run test:coverage # Tests with coverage
npm run lint          # Oxlint + ESLint
npm run lint:fix      # Oxlint + ESLint with auto-fix
npm run format        # Prettier
npm run build-prod    # Production build
npm run typecheck     # tsc for the root project and each package
```

**Run a single test file:**

```bash
npx vitest tests/YourTest.test.ts --run
npx vitest NationAllianceBehavior --run # match by name pattern
```

## Architecture

OpenFront.io is a real-time, single-player territorial strategy game: the whole game runs in the browser against AI nations and tribes, and there is no online play. There are three components:

1. **The engine** — Deterministic game simulation, split into npm workspace packages under `packages/` (see below). Pure TypeScript with **no external dependencies** beyond zod. Must stay bit-identical on every client: use the seeded PRNG, and use `packages/engine-lib/src/DetMath.ts` instead of `Math.exp`/`log`/`pow`/`sin`/… or `**` with an exponent other than 2 (ESLint enforces this). Runs in a Web Worker thread. All `packages/engine`, `packages/engine-api` and `packages/engine-lib` changes **must** include tests.
2. **`src/client/`** — Rendering (custom WebGL2 renderer in `src/client/render/`), UI (Lit web components + Tailwind CSS 4), the in-process game clock (`LocalServer`) and `Transport`.
3. **`src/server/`** — A small static file server that renders `index.html` and serves the built client (Node.js/Express).

### Packages

| Package                 | Directory             | Contents                                                                                                                                                     |
| ----------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@openfront/engine-api` | `packages/engine-api` | The contract with the engine: intent/config schemas, game types and enums, `GameUpdates`, the worker protocol, the `GameMap` interface, read-view interfaces |
| `@openfront/engine-lib` | `packages/engine-lib` | Engine code that also runs outside the engine: the tile grid (`GameMapImpl`), terrain loading, the rules `Config`, `UnitGrid`, PRNG, `DetMath`, formatting   |
| `@openfront/engine`     | `packages/engine`     | The simulation: executions, `*Impl`, pathfinding, snapshots, `GameRunner`, the worker entry                                                                  |
| `@openfront/shared`     | `packages/shared`     | Client/server code that isn't simulation: game-clock message schemas, env, asset URLs, map loaders (`GameMapLoader`, `FetchGameMapLoader`)                   |
| `@openfront/zbin`       | `packages/zbin`       | Binary format for zod schemas                                                                                                                                |

Import them as `@openfront/<pkg>/<path>` (e.g. `@openfront/engine-api/game/GameMap`); paths mirror `packages/<pkg>/src/`. The allowed graph is enforced by `tests/LayerBoundaries.test.ts`:

- `engine-api` imports only zod, `zbin` and `resources/*.json`; `engine-lib` adds `engine-api`; `engine` adds `engine-lib`. None of them may import `shared`, `src/client` or `src/server`, use `Math.random`/`Date.now`/`new Date` or the approximated `Math` functions (`sin`, `pow`, `exp`, `log`, `atan2`…; `engine-lib/DetMath` has exact ones), use host APIs beyond `console`, `performance` and `TextEncoder`/`TextDecoder` (their tsconfigs use `lib: ["ES2022"]` plus `packages/engine-api/globals.d.ts`; only the worker entry and protocol, `src/worker/`, get the WebWorker lib), or fetch anything: the engine's host passes it the map files in `init`.
- `shared` may import `engine-api` and `engine-lib`, never `engine`.
- `src/client` and `src/server` import `engine-api`, `engine-lib` and `shared`; the client loads `engine` only through `packages/engine/src/worker/Worker.worker.ts`, and the server never loads it.
- The homepage (`src/client/Main.ts` and its static imports) never statically imports the game client (`ClientGameRunner`, `Transport`, `hud/`, `render/`, `view/`, `controllers/`…): it's a separate chunk, loaded through `GameClientLoader` on join and prefetched once the page is idle. Load it with `import()`, or move what the homepage needs into a small module of its own. The same goes for the modals in `LazyModals.ts`: `showPage` and the modal router load them, and code that calls one of them directly loads it first (`whenModalLoaded(tag, open)`, or await `loadModal(tag)`) and imports its class only with `import type`.
- Rules that run on both sides (e.g. `Config.maxTroops`) take `PlayerLike`/`UnitLike`/`GameLike` from `engine-api/game/ReadViews.ts` and live in `engine-lib`; both the engine objects and the client views implement.

### Simulation Flow (Intent → Execution)

The game simulation runs in a worker in the browser. There is no server in the loop.

1. Player action → client creates an **Intent** → sent to the in-process game clock (`src/client/LocalServer.ts`)
2. The game clock bundles the intents of a tick into a **Turn** → hands it to the client
3. Client forwards Turn to the Core worker
4. Core creates an **Execution** for each intent
5. Core calls `executeNextTick()` — all executions run and mutate game state
6. Core sends **GameUpdates** back to client → client renders

Intents are Zod-validated schemas defined in `packages/engine-api/src/Schemas.ts`; the messages between the game runner and the game clock are in `packages/shared/src/WireSchemas.ts`.

### CDN / Static Assets

The server only renders `index.html` and serves static files. Other assets (JS bundle, images, maps, worker) can come from a CDN bucket. `CDN_BASE` is an empty string in dev (falls back to same-origin) and a full origin (e.g. `https://cdn.example.com`) in production. It is set as both a Vite build-time variable and a server runtime env var.

## Key Files

| File                                   | Purpose                                    |
| -------------------------------------- | ------------------------------------------ |
| `packages/engine-api/src/Schemas.ts`   | Intent and game config types (Zod schemas) |
| `packages/shared/src/WireSchemas.ts`   | Game runner ↔ game clock messages (Zod)    |
| `packages/engine/src/GameRunner.ts`    | Simulation orchestrator                    |
| `packages/engine/src/game/GameImpl.ts` | Game state implementation                  |
| `src/client/LocalServer.ts`            | In-process game clock (turns)              |
| `src/server/Server.ts`                 | Static file server                         |
| `tests/util/Setup.ts`                  | Test helper — creates test games           |
| `tests/LayerBoundaries.test.ts`        | Enforces the package import rules          |
| `docs/Architecture.md`                 | Architecture overview                      |
| `packages/zbin/README.md`              | Binary format for zod schemas              |
| `vite.config.ts`                       | Build config, CDN handling                 |

## UI Text / i18n

All user-visible text must go through `translateText()` and have a corresponding entry added to `resources/lang/en.json`. Translations are managed via Crowdin. DO NOT modify any other translation files.

## Testing Patterns

Tests use a `setup()` helper from `tests/util/Setup.ts` that creates a full game instance with map data from `tests/testdata/maps/`. Write tests that exercise the core simulation directly — not mocks.

## Tech Stack

- **Bundler:** Vite + TypeScript 6
- **Rendering:** Custom WebGL2 renderer (`src/client/render/`)
- **UI Components:** Lit (LitElement) + Tailwind CSS 4
- **Audio:** Howler.js
- **Schemas/Validation:** Zod
- **Testing:** Vitest
- **Server:** Node.js, Express (static files only)
