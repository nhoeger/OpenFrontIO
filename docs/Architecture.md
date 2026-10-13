# Game Architecture

The game is split into three components:

1. **client** - Handles rendering and UI for the user

2. **core** - Deterministic simulation. It is pure TypeScript/JavaScript code with no external dependencies. It must be fully deterministic. It lives in npm workspace packages:
   - `packages/engine` (`@openfront/engine`) - the simulation itself: executions, game state, pathfinding, snapshots and the worker entry.
   - `packages/engine-api` (`@openfront/engine-api`) - the contract between the engine and its hosts: intent and config schemas, game types and enums, game updates, the worker protocol, the `GameMap` interface, the map files (`MapFiles`, the manifest) and the read interfaces (`PlayerLike`, `UnitLike`, `GameLike`) that let the same rules run on engine objects and client views.
   - `packages/engine-lib` (`@openfront/engine-lib`) - engine code that also runs outside the engine, so the client can interpret what the engine does: the tile grid (`GameMapImpl`), building the maps from a map's files, the rules `Config`, `UnitGrid`, the seeded PRNG and deterministic math.
   - `packages/shared` (`@openfront/shared`) - client/server code that is not simulation: the schemas of the messages between the game runner and the local game clock, environment, asset URLs and the map loaders (`GameMapLoader`, which also loads thumbnails and layer images for the client).
   - `packages/zbin` (`@openfront/zbin`) - the binary format library the intent and config schemas are written in.

   The client and server import `engine-api`, `engine-lib` and `shared`; only the simulation worker loads `engine`. `engine-api` depends on nothing but zod and zbin. `tests/LayerBoundaries.test.ts` enforces these rules, and `engine`, `engine-api` and `engine-lib` are type-checked against ES2022 plus the few host APIs in `packages/engine-api/globals.d.ts` (`console`, `performance`, `TextEncoder`/`TextDecoder`), so a browser or Node API anywhere but the worker entry fails `npm run typecheck`.

   The engine is hermetic: it loads nothing itself. Its host (`WorkerClient`) loads the map files (`loadMapFiles`) and passes them in the worker's `init` message, which hands them to `createGameRunner`, and the boundary test fails on network calls in engine code.

3. **server** - A small static file server. It renders `index.html` and serves the built client. The game itself needs no server.

## Simulation Architecture

The whole game runs in the browser. The client runs an instance of core in a worker thread, which is why core must be deterministic. At the end of each tick, data is sent from core to client via GameUpdates.

## Intents

When a user performs an action, it creates an "Intent". The in-process game clock (`src/client/LocalServer.ts`) stamps it with the player's id, bundles all intents of a tick into a "turn" and hands the turn to the client. The client sends it to its core simulation, which creates an "Execution" for each intent. Executions are the only thing that can modify the game state.

## Flow

1. Client sends intent to the local game clock
2. The game clock sends a turn to the client
3. Client forwards turn to core
4. Core creates an execution for each intent
5. Core calls `executeNextTick()`
6. All executions run
7. At the end of the tick core sends updates to client
8. Client renders the updates

## Static Assets / CDN

The server only renders `index.html` and serves static files. Every other asset (the Vite JS/CSS bundle, images, map binaries, the worker module) can be served from a CDN bucket. Setting `CDN_BASE` to an empty string falls back to same-origin and is the dev default.

### `CDN_BASE` format

- Full origin, no path, no trailing slash: `https://cdn.example.com`
- Set as a build-time variable in `vite.config.ts` (so the manifest is built with absolute URLs) and as a runtime env var on the server (so `RenderHtml.ts` can prefix Vite's emitted `/assets/...` refs at request time).
