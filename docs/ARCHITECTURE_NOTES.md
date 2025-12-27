# Architecture Notes

This PoC follows a Figma-like separation:

- **React/DOM**: app chrome + widget content
- **WebGL2 canvas**: pan/zoom camera, widget frames, selection/handles, drag ghost, and (later) snapping/guides
- **Serializable document**: `WorkspaceDoc` is the canonical state persisted by workspace id

## Scene graph shape

Canonical state lives in `packages/shared/src/index.ts` as a JSON-serializable `WorkspaceDoc`:

- `viewport`: `{ centerX, centerY, zoom }`
- `nodes`: `Record<nodeId, WorkspaceNode>`
- `nodeOrder`: z-order array
- `selection`: kept in the doc shape for convenience, but treated as **client-only UI state**

For rendering, we use a retained-mode approach:

- `nodeOrder` defines z-order and is the primary list for draw order
- each node is rendered as a *frame* in WebGL and (if widget) also has React content in the overlay

## Spatial index for hit-testing

We use **RBush** (`apps/web/src/canvas/spatialIndex.ts`) because:

- inserts/search are fast for axis-aligned bounds (AABBs)
- it avoids linear hit-testing as node count grows (200+ widgets stays interactive)

Hit-test flow:

- convert pointer screen→world using the viewport camera
- query RBush with a point-sized box at \((x,y)\)
- pick the topmost hit via stored `order` (derived from `nodeOrder`)

## World ↔ screen transforms

We keep the camera in world coordinates:

- world position \(p=(x,y)\) is mapped to screen pixels by translating relative to `viewport.center` then scaling by `viewport.zoom`.

Implementation lives in `apps/web/src/canvas/viewport.ts`:

- `worldToScreen(viewport, size, p)`
- `screenToWorld(viewport, size, p)`
- `zoomAroundScreenPoint(...)` adjusts center so zoom happens around the cursor (feels “Figma-like”)

## WebGL renderer

The WebGL renderer is intentionally minimal and readable:

- `apps/web/src/canvas/RectRenderer.ts`: batched rectangle draw (two triangles per rect)
- `apps/web/src/canvas/CanvasEngine.ts`: builds batches for node fills/borders + selection outlines/handles + ghost preview

In this PoC we redraw the full canvas each time (coarse invalidation). The perf overlay shows render time.

## DOM overlay sync (hybrid approach)

Widget contents are rendered in React DOM (`apps/web/src/components/WidgetOverlayLayer.tsx`):

- the overlay computes each widget’s screen-space `left/top/width/height` using the **same** `worldToScreen` transform
- the overlay is visually framed by the WebGL layer, but content is interactive (inputs/buttons work)

## Input model

`apps/web/src/components/WorkspaceStage.tsx` owns user input so both layers stay consistent:

- wheel zoom around cursor
- Space+drag panning
- click selection (RBush hit-test)
- drag move + corner resize are RAF-batched reducer updates to avoid React re-render storms

