# GM — Canvas Trading Workspace (PoC)

Proof-of-concept **high-performance canvas UI workspace** for a **crypto trading app**, inspired by Figma’s architecture:

- **React/DOM** for app chrome + widget content
- **GPU-accelerated canvas (WebGL2)** for pan/zoom, frames, selection/handles, hit-testing, drag ghost
- **Serializable document state** persisted by workspace id

## Repo layout

- `apps/web`: Vite + React + TypeScript
- `apps/server`: Fastify + TypeScript + SQLite
- `packages/shared`: shared doc model + reducer + schemas

## Quickstart

```bash
npm install
npm run dev
```

- Web: `http://localhost:5173`
- Server: `http://localhost:3001` (Vite proxies `/api/*`)

## Core user flow

- Open `http://localhost:5173`
- Click **Create new workspace**
- You’ll land on `/w/<workspaceId>` (shareable)
- Drag widgets from the **Palette** onto the canvas (ghost preview)
- **Pan**: hold **Space** and drag
- **Zoom**: mouse wheel (zooms around cursor)
- **Select**: click (shift-click toggles)
- **Move**: click-drag a selected widget
- **Resize**: drag corner handles
- Refresh the page: the same layout restores from the server

## Persistence

- Server persists a canonical `WorkspaceDoc` by id:
  - `POST /api/workspaces`
  - `GET /api/workspaces/:id`
  - `PUT /api/workspaces/:id` (optimistic versioning)
- Client autosaves (debounced) and also supports manual **Save**
- Selection is treated as client-only UI state and is not persisted

## Perf harness

- On `/w/<id>`, click **Spawn 200 widgets**
- Watch the bottom-right overlay:
  - FPS
  - render ms (WebGL draw time)
  - hitTest ms (RBush query time)
  - reducer ms (dispatch time)

## Tests

```bash
# reducer + serialization
npm -w packages/shared run test

# API roundtrip tests (Fastify inject + SQLite)
npm -w apps/server run test
```

## Docs

- **Architecture Notes**: `docs/ARCHITECTURE_NOTES.md`
