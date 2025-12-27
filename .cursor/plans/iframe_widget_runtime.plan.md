# Iframe widget runtime (3rd-party) with capability injection

## Goal
Enable **3rd‑party widgets** to run in **cross‑origin sandboxed iframes** with a **Farcaster Mini Apps–style** SDK:
- Host injects `context` (session/workspace/widget props) and a set of **granted capabilities**.
- Widgets call `sdk.getCapabilities()` and `sdk.request(...)` to access privileged actions.
- Widgets never receive raw secrets (API keys, OAuth tokens).

References:
- Mini Apps overview: https://miniapps.farcaster.xyz/
- Context model + capability detection pattern: https://miniapps.farcaster.xyz/docs/sdk/context

## Constraints (as decided)
- Widget code runs in **sandboxed iframes**.
- **Cross‑origin even in dev** (to match prod).
- **Global per user** install & permissions (reusable across workspaces).
- Widgets can use direct `fetch` for public endpoints, but privileged/identity-bound actions must go through capabilities.

## Plan

### 1) Define the widget manifest + install registry (global per user)
Create a manifest schema:
- `widgetId`, `name`, `version`, `publisher`
- `entry.url` (iframe URL)
- `permissions[]` (requested caps)
- `defaultSize`, `minSize`
- optional `settingsSchema`

Implement a `WidgetRegistry` persisted in `localStorage` (PoC):
- Installed manifests keyed by `widgetId`
- Granted permissions per widgetId (user-approved)
- Dev origin allowlist (localhost origins, still cross-origin)

Files:
- Add `apps/web/src/plugins/manifest.ts` (zod schema)
- Add `apps/web/src/plugins/registry.ts` (load/save registry)
- Add `apps/web/src/plugins/permissions.ts` (types + helpers)

UI:
- Add a simple “Widget Store / Installed” panel (can be in left palette or a modal)
- On first use of a widgetId, prompt approval based on manifest permissions

Files:
- Update `apps/web/src/pages/WorkspacePage.tsx` to show install/grant UI

### 2) Introduce an iframe WidgetHost and message protocol
Implement `WidgetHost` that renders an iframe per widget node:
- Uses `sandbox=\"allow-scripts allow-forms\"` (no same-origin)
- Establishes handshake over `postMessage`:
  - Host → `gm:init` { instanceId, context, grantedCaps }
  - Widget → `gm:ready` { protocolVersion }
- RPC envelopes:
  - `gm:rpc:req` { id, method, params }
  - `gm:rpc:res` { id, ok, result|error }
  - `gm:evt` { name, payload }

Files:
- Add `apps/web/src/plugins/protocol.ts` (types + validation)
- Add `apps/web/src/plugins/WidgetHost.tsx` (iframe + RPC wiring)
- Update `apps/web/src/components/WidgetOverlayLayer.tsx` to render either:
  - first‑party React widgets (existing), or
  - iframe widgets by `widgetId`

### 3) Capability surface (initial)
Provide a small v0 capability set:
- `cap.marketData.subscribe(symbol)` → host streams ticks (DataStore already exists)
- `cap.orders.submit({symbol, side, qty, price?})` → calls `/api/orders?as=...`
- `cap.wallet.requestTransaction(tx)` → stub or passthrough to `window.ethereum.request` (if present)

Enforcement:
- Capability calls are allowed only if widget has permission granted.
- Validate inputs (zod) and rate-limit obvious spam.

Files:
- Add `apps/web/src/plugins/capabilities.ts` (dispatch table)
- Update `apps/web/src/data/DataStore.ts` to allow host-side fanout to widgets (already mostly there)

### 4) Widget SDK for third parties
Create `packages/widget-sdk`:
- `sdk.context` (mirrors Mini Apps pattern)
- `sdk.getCapabilities()`
- `sdk.request(method, params)`
- event subscription helpers

Files:
- Add `packages/widget-sdk/package.json`, `src/index.ts`, `tsconfig.json`, `vitest.config.ts`
- Update root `package.json` workspaces if needed (should already exist)

### 5) Cross-origin dev workflow + sample widget app
Add a sample widget Vite app served on its own origin:
- `apps/widget-sample` runs on `http://localhost:4173` (or similar)
- Demonstrates using `@gm/widget-sdk` and calling capabilities

Host dev:
- Provide an allowlist (e.g. env var `GM_WIDGET_DEV_ORIGINS`) and display a warning banner when enabled.

Files:
- Add `apps/widget-sample/` (Vite + simple UI)
- Update root dev scripts to run host + widget sample concurrently

### 6) Tests
Unit tests:
- protocol validation
- registry persistence
- capability enforcement (denied calls rejected)

Files:
- Add `apps/web/src/plugins/*.test.ts`
- Add tests in `packages/widget-sdk`

## Success criteria
- Install a 3rd-party widget via manifest URL.
- On first use: permission prompt; after approve: widget renders in iframe.
- Widget can subscribe to market data and submit orders via capabilities.
- Same widget works in dev and prod modes because it’s cross-origin in both.


