import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGetWorkspace } from "../api/workspaces";
import {
  applyWorkspaceOp,
  createEmptyWorkspaceDoc,
  type WorkspaceDoc,
  type WorkspaceOp,
  workspaceDocReducer,
} from "@gm/shared";
import { WorkspaceStage } from "../components/WorkspaceStage";
import { PerfOverlay } from "../components/PerfOverlay";
import { useFps, type PerfStats } from "../hooks/useFps";
import type { WorkspaceAction } from "@gm/shared";
import { createDocSyncClient } from "../sync/docSyncClient";
import {
  encodeDocToSnapshotPayload,
  snapshotUrlFromPayload,
  decodeDocFromSnapshotPayloadSync,
} from "../share/snapshotUrl";
import { getSnapshotPayloadFromHash } from "../share/urlHash";
import { useUrlSnapshot } from "../share/useUrlSnapshot";
import { apiCopyWorkspace } from "../api/workspaceCopy";
import { useNavigate } from "react-router-dom";
import { parseWidgetManifest } from "../plugins/manifest";
import { allCapabilities, type Capability } from "../plugins/permissions";
import {
  loadWidgetRegistry,
  listInstalledWidgets,
  removeInstalledWidget,
  setGrantedCapabilities,
  upsertInstalledWidget,
} from "../plugins/registry";

type LoadState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "loaded"; doc: WorkspaceDoc; canEdit: boolean }
  | { type: "error"; message: string };

export function WorkspacePage() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>({ type: "idle" });

  const [doc, dispatch] = useReducer(
    workspaceDocReducer,
    workspaceId ?? crypto.randomUUID(),
    (id) =>
      createEmptyWorkspaceDoc({
        workspaceId: id,
        now: new Date().toISOString(),
      })
  );
  const docRef = useRef<WorkspaceDoc | null>(null);
  const fps = useFps();
  const [perf, setPerf] = useState<PerfStats>({
    fps: 0,
    renderMs: null,
    hitTestMs: null,
    reducerMs: null,
  });
  const onPerf = useCallback(
    (p: { renderMs?: number; hitTestMs?: number }) => setPerf((prev) => ({ ...prev, ...p })),
    []
  );
  const [wsConnected, setWsConnected] = useState(false);
  const syncRef = useRef<ReturnType<typeof createDocSyncClient> | null>(null);
  const appliedLocalOpIdsRef = useRef<Set<string>>(new Set());
  const [isSnapshotSharing, setIsSnapshotSharing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [manifestUrl, setManifestUrl] = useState("");
  const [manifestErr, setManifestErr] = useState<string | null>(null);
  const [pluginRegistry, setPluginRegistry] = useState(() => loadWidgetRegistry());

  const shareUrl = useMemo(() => {
    if (!workspaceId) return "";
    return `${window.location.origin}/w/${workspaceId}`;
  }, [workspaceId]);

  const installedPlugins = useMemo(() => listInstalledWidgets(pluginRegistry), [pluginRegistry]);

  // Hydrate from hash snapshot immediately if present (fast TTI for shared links).
  useEffect(() => {
    if (!workspaceId) return;
    const payload = getSnapshotPayloadFromHash();
    if (!payload) return;
    try {
      const decoded = decodeDocFromSnapshotPayloadSync(payload);
      if (decoded.workspaceId !== workspaceId) return;
      dispatch({ type: "docLoaded", doc: { ...decoded, selection: [] } });
    } catch {
      // ignore invalid payload
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadState({ type: "loading" });
        const res = await apiGetWorkspace(workspaceId);
        if (cancelled) return;
        setLoadState({
          type: "loaded",
          doc: res.doc,
          canEdit: res.canEdit ?? false,
        });
      } catch (e) {
        if (cancelled) return;
        setLoadState({
          type: "error",
          message: e instanceof Error ? e.message : "failed to load workspace",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (loadState.type !== "loaded") return;
    dispatch({ type: "docLoaded", doc: loadState.doc });
  }, [loadState]);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  // Continuously maintain a shareable “current URL” snapshot.
  useUrlSnapshot({ doc, enabled: true });

  async function onCopyShareLink() {
    await navigator.clipboard.writeText(shareUrl);
  }

  async function onCopySnapshotLink() {
    const current = docRef.current;
    if (!current) return;
    try {
      setIsSnapshotSharing(true);
      const payload = await encodeDocToSnapshotPayload(current);
      await navigator.clipboard.writeText(snapshotUrlFromPayload(payload));
    } finally {
      setIsSnapshotSharing(false);
    }
  }

  async function onMakeCopy() {
    const current = docRef.current;
    if (!current) return;
    try {
      setIsCopying(true);
      const payload =
        getSnapshotPayloadFromHash() ??
        (await encodeDocToSnapshotPayload(current));
      const copied = await apiCopyWorkspace({
        snapshotPayload: payload,
        sourceWorkspaceId: workspaceId ?? undefined,
      });
      // Navigate to new workspace; URL snapshot hook will keep hash updated from doc state.
      navigate(`/w/${copied.workspaceId}${window.location.search}`);
    } finally {
      setIsCopying(false);
    }
  }

  // Doc sync over WebSocket (Figma-like: sync ops, not pixels).
  useEffect(() => {
    if (!workspaceId) return;
    if (loadState.type !== "loaded") return;

    const clientId = (() => {
      const key = "gm.clientId";
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const next = crypto.randomUUID();
      localStorage.setItem(key, next);
      return next;
    })();
    const viewerId =
      new URLSearchParams(window.location.search).get("as") ?? "anon";

    appliedLocalOpIdsRef.current = new Set();

    // Tear down any previous connection (e.g., route change).
    syncRef.current?.close();

    const client = createDocSyncClient({
      workspaceId,
      clientId,
      viewerId,
      afterSeq: loadState.doc.version ?? 0,
      events: {
        onStatus: (s) => setWsConnected(s.connected),
        onSnapshot: (d, serverSeq) => {
          // Snapshot is authoritative; clear selection (UI-only).
          dispatch({
            type: "docLoaded",
            doc: { ...d, selection: [], version: serverSeq },
          });
        },
        onRemoteOp: (op: WorkspaceOp, serverSeq: number) => {
          const current = docRef.current;
          if (!current) return;

          // If we already applied this op optimistically, don't apply again; still advance serverSeq.
          if (appliedLocalOpIdsRef.current.has(op.opId)) {
            dispatch({
              type: "docLoaded",
              doc: { ...current, version: serverSeq },
            });
            return;
          }

          const next = applyWorkspaceOp(current, op);
          dispatch({ type: "docLoaded", doc: { ...next, version: serverSeq } });
        },
        onAck: (opId, serverSeq) => {
          const current = docRef.current;
          if (!current) return;
          appliedLocalOpIdsRef.current.delete(opId);
          dispatch({
            type: "docLoaded",
            doc: { ...current, version: serverSeq },
          });
        },
      },
    });

    syncRef.current = client;
    return () => {
      syncRef.current?.close();
      syncRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, loadState.type]);

  useEffect(() => {
    setPerf((p) => ({ ...p, fps }));
  }, [fps]);

  const dispatchWithPerf = (action: WorkspaceAction) => {
    const t0 = performance.now();
    const current = docRef.current;
    if (!current) return;

    // Selection is UI-only; keep local.
    if (action.type === "setSelection") {
      dispatch(action);
      setPerf((p) => ({ ...p, reducerMs: performance.now() - t0 }));
      return;
    }

    // Convert local actions to WorkspaceOps and apply optimistically.
    const clientId = localStorage.getItem("gm.clientId") ?? "local";
    const opId = crypto.randomUUID();
    const now =
      action.type === "applyOp"
        ? action.op.now
        : "now" in action
        ? action.now
        : new Date().toISOString();

    const op: WorkspaceOp | null = (() => {
      switch (action.type) {
        case "setViewport":
          return {
            opId,
            clientId,
            now,
            type: "setViewport",
            viewport: action.viewport,
          };
        case "addWidget":
          return { opId, clientId, now, type: "addNode", node: action.node };
        case "addFrame":
          return { opId, clientId, now, type: "addNode", node: action.node };
        case "updateNodeProps":
          return {
            opId,
            clientId,
            now,
            type: "updateNodeProps",
            nodeId: action.nodeId,
            props: action.props,
          };
        case "moveNodes":
          return {
            opId,
            clientId,
            now,
            type: "moveNodes",
            nodeIds: action.nodeIds,
            dx: action.dx,
            dy: action.dy,
          };
        case "resizeNode":
          return {
            opId,
            clientId,
            now,
            type: "resizeNode",
            nodeId: action.nodeId,
            x: action.x,
            y: action.y,
            w: action.w,
            h: action.h,
          };
        case "deleteNodes":
          return {
            opId,
            clientId,
            now,
            type: "deleteNodes",
            nodeIds: action.nodeIds,
          };
        case "setNodeOrder":
          return {
            opId,
            clientId,
            now,
            type: "setNodeOrder",
            nodeOrder: action.nodeOrder,
          };
        default:
          return null;
      }
    })();

    if (!op) {
      dispatch(action);
      setPerf((p) => ({ ...p, reducerMs: performance.now() - t0 }));
      return;
    }

    const next = applyWorkspaceOp(current, op);
    const nextWithSelection =
      action.type === "addWidget" || action.type === "addFrame"
        ? { ...next, selection: [action.node.id] }
        : next;
    dispatch({ type: "docLoaded", doc: nextWithSelection });

    appliedLocalOpIdsRef.current.add(op.opId);
    if (loadState.type === "loaded" && loadState.canEdit) {
      syncRef.current?.sendOp(op);
    }

    setPerf((p) => ({ ...p, reducerMs: performance.now() - t0 }));
  };

  if (!workspaceId)
    return <div style={{ padding: 16 }}>Missing workspace id.</div>;

  const viewport =
    loadState.type === "loaded"
      ? doc.viewport
      : { centerX: 0, centerY: 0, zoom: 1 };

  return (
    <div className="appShell">
      <div className="topbar">
        <div>
          <div className="topbarTitle">GM Workspace</div>
          <div className="mono">{workspaceId}</div>
        </div>
        <div className="topbarActions">
          <button
            className="btn"
            onClick={onCopyShareLink}
            disabled={!shareUrl}
          >
            Copy share link
          </button>
          <button
            className="btn"
            onClick={onCopySnapshotLink}
            disabled={isSnapshotSharing}
          >
            {isSnapshotSharing ? "Encoding…" : "Copy snapshot link"}
          </button>
          <button className="btn" disabled>
            {wsConnected ? "Synced" : "Offline"}
          </button>
          <div className="mono" style={{ opacity: 0.75 }}>
            {loadState.type === "loaded"
              ? loadState.canEdit
                ? "edit"
                : "view"
              : "—"}
          </div>
          {loadState.type === "loaded" && !loadState.canEdit && (
            <button className="btn" onClick={onMakeCopy} disabled={isCopying}>
              {isCopying ? "Copying…" : "Make a copy"}
            </button>
          )}
        </div>
      </div>

      <div className="palette">
        <div className="cardTitle">Palette</div>
        <div style={{ display: "grid", gap: 8 }}>
          <div className="mono" style={{ opacity: 0.85, marginBottom: 4 }}>
            Drag onto canvas:
          </div>
          <PaletteDragItem
            widgetType="priceChart"
            label="Price Chart"
            disabled={loadState.type !== "loaded" || !loadState.canEdit}
          />
          <PaletteDragItem
            widgetType="orderEntry"
            label="Order Entry"
            disabled={loadState.type !== "loaded" || !loadState.canEdit}
          />
          <PaletteDragItem
            widgetType="marketWatch"
            label="Market Watch"
            disabled={loadState.type !== "loaded" || !loadState.canEdit}
          />
          <button className="btn" onClick={() => setSnapToGrid((v) => !v)} title="Snap move/resize to grid">
            Snap: {snapToGrid ? "On" : "Off"}
          </button>
          <button
            className="btn"
            disabled={loadState.type !== "loaded" || !loadState.canEdit}
            onClick={() => {
              const now = new Date().toISOString();
              for (let i = 0; i < 200; i++) {
                const id = crypto.randomUUID();
                dispatchWithPerf({
                  type: "addWidget",
                  now,
                  node: {
                    id,
                    type: "widget",
                    x: doc.viewport.centerX + (i % 20) * 420 - 4200,
                    y: doc.viewport.centerY + Math.floor(i / 20) * 280 - 1400,
                    w: 400,
                    h: 240,
                    props: {
                      widgetType: "priceChart",
                      symbol: "BTC-USD",
                      timeframe: "1m",
                    },
                    createdAt: now,
                    updatedAt: now,
                  },
                });
              }
            }}
          >
            Spawn 200 widgets
          </button>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="cardTitle">3rd‑party widgets</div>
          <div style={{ display: "grid", gap: 8 }}>
            <input
              className="input"
              placeholder="Manifest URL (https://…/manifest.json)"
              value={manifestUrl}
              onChange={(e) => setManifestUrl(e.target.value)}
            />
            <button
              className="btn"
              onClick={async () => {
                setManifestErr(null);
                try {
                  const res = await fetch(manifestUrl);
                  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
                  const json = await res.json();
                  const manifest = parseWidgetManifest(json);
                  upsertInstalledWidget({ manifest });
                  setPluginRegistry(loadWidgetRegistry());
                } catch (e) {
                  setManifestErr(e instanceof Error ? e.message : "failed to install manifest");
                }
              }}
              disabled={!manifestUrl}
            >
              Install
            </button>
            {manifestErr && (
              <div className="mono" style={{ color: "rgba(255,120,140,0.95)", fontSize: 12 }}>
                {manifestErr}
              </div>
            )}
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {installedPlugins.length === 0 && (
              <div className="mono" style={{ opacity: 0.6 }}>
                No plugins installed.
              </div>
            )}
            {installedPlugins.map((w) => (
              <div
                key={w.manifest.widgetId}
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{w.manifest.name}</div>
                    <div className="mono" style={{ fontSize: 12, opacity: 0.75 }}>
                      {w.manifest.widgetId} · v{w.manifest.version}
                    </div>
                  </div>
                  <button
                    className="btn"
                    onClick={() => {
                      removeInstalledWidget(w.manifest.widgetId);
                      setPluginRegistry(loadWidgetRegistry());
                    }}
                  >
                    Remove
                  </button>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div className="mono" style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                    Permissions
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {allCapabilities
                      .filter((cap) => w.manifest.permissions.includes(cap))
                      .map((cap) => {
                        const checked = w.granted.includes(cap);
                        return (
                          <label key={cap} className="mono" style={{ fontSize: 12, opacity: 0.9, display: "flex", gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = new Set<Capability>(w.granted);
                                if (e.target.checked) next.add(cap);
                                else next.delete(cap);
                                setGrantedCapabilities({ widgetId: w.manifest.widgetId, granted: [...next] });
                                setPluginRegistry(loadWidgetRegistry());
                              }}
                            />
                            <span>{cap}</span>
                          </label>
                        );
                      })}
                    {w.manifest.permissions.length === 0 && (
                      <div className="mono" style={{ fontSize: 12, opacity: 0.6 }}>
                        (no permissions requested)
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <button
                    className="btn"
                    disabled={loadState.type !== "loaded" || !loadState.canEdit}
                    onClick={() => {
                      const now = new Date().toISOString();
                      const id = crypto.randomUUID();
                      dispatchWithPerf({
                        type: "addWidget",
                        now,
                        node: {
                          id,
                          type: "widget",
                          x: doc.viewport.centerX - 200,
                          y: doc.viewport.centerY - 120,
                          w: w.manifest.defaultSize?.w ?? 420,
                          h: w.manifest.defaultSize?.h ?? 280,
                          props: { widgetType: "plugin", widgetId: w.manifest.widgetId },
                          createdAt: now,
                          updatedAt: now,
                        },
                      });
                    }}
                  >
                    Add to canvas
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="cardTitle">Load</div>
          <div className="mono">
            {loadState.type === "loading" && "Loading…"}
            {loadState.type === "error" && `Error: ${loadState.message}`}
            {loadState.type === "loaded" && `Loaded v${loadState.doc.version}`}
            {loadState.type === "idle" && "—"}
          </div>
        </div>
      </div>

      <div className="workspace">
        {loadState.type === "loaded" && (
          <WorkspaceStage
            doc={doc}
            viewport={viewport}
            dispatch={dispatchWithPerf}
            readOnly={!loadState.canEdit}
            snapToGrid={snapToGrid}
            gridSize={20}
            onPerf={onPerf}
          />
        )}
        {loadState.type === "loaded" && (
          <PerfOverlay stats={perf} nodeCount={doc.nodeOrder.length} />
        )}
      </div>

      <div className="props">
        <div className="cardTitle">Properties</div>
        <div className="mono" style={{ marginBottom: 10 }}>
          Selection: {loadState.type === "loaded" ? doc.selection.length : 0}
        </div>

        {loadState.type === "loaded" && doc.selection.length > 0 && (
          <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            <div className="cardTitle">Arrange</div>
            <button
              className="btn"
              disabled={!loadState.canEdit}
              onClick={() => {
                const sel = new Set(doc.selection);
                const kept = doc.nodeOrder.filter((id) => !sel.has(id));
                const moved = doc.nodeOrder.filter((id) => sel.has(id));
                dispatchWithPerf({
                  type: "setNodeOrder",
                  nodeOrder: [...kept, ...moved],
                  now: new Date().toISOString(),
                });
              }}
            >
              Bring to front
            </button>
            <button
              className="btn"
              disabled={!loadState.canEdit}
              onClick={() => {
                const sel = new Set(doc.selection);
                const kept = doc.nodeOrder.filter((id) => !sel.has(id));
                const moved = doc.nodeOrder.filter((id) => sel.has(id));
                dispatchWithPerf({
                  type: "setNodeOrder",
                  nodeOrder: [...moved, ...kept],
                  now: new Date().toISOString(),
                });
              }}
            >
              Send to back
            </button>
          </div>
        )}

        <div className="cardTitle">Doc</div>
        <div className="mono">
          {loadState.type === "loaded"
            ? `version=${doc.version} nodes=${doc.nodeOrder.length}`
            : "—"}
        </div>

        {loadState.type === "loaded" &&
          doc.selection.length === 1 &&
          (() => {
            const n = doc.nodes[doc.selection[0]];
            if (!n || n.type !== "widget") return null;
            return (
              <div style={{ marginTop: 14 }}>
                <div className="cardTitle">Widget</div>
                <div className="mono" style={{ marginBottom: 8 }}>
                  {n.props.widgetType}
                </div>

                {"symbol" in n.props && (
                  <label className="field">
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Symbol</div>
                    <input
                      className="input"
                      value={(n.props.symbol as string | undefined) ?? ""}
                      onChange={(e) =>
                        dispatchWithPerf({
                          type: "updateNodeProps",
                          nodeId: n.id,
                          props: { symbol: e.target.value },
                          now: new Date().toISOString(),
                        })
                      }
                    />
                  </label>
                )}

                {n.props.widgetType === "priceChart" && (
                  <label className="field">
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Timeframe</div>
                    <select
                      className="input"
                      value={(n.props.timeframe as string | undefined) ?? "1m"}
                      onChange={(e) =>
                        dispatchWithPerf({
                          type: "updateNodeProps",
                          nodeId: n.id,
                          props: { timeframe: e.target.value },
                          now: new Date().toISOString(),
                        })
                      }
                    >
                      <option value="1m">1m</option>
                      <option value="5m">5m</option>
                      <option value="15m">15m</option>
                      <option value="1h">1h</option>
                      <option value="4h">4h</option>
                      <option value="1d">1d</option>
                    </select>
                  </label>
                )}
              </div>
            );
          })()}
      </div>
    </div>
  );
}

function PaletteDragItem(props: {
  widgetType: string;
  label: string;
  disabled: boolean;
}) {
  return (
    <div
      className="btn"
      draggable={!props.disabled}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-gm-widget", props.widgetType);
        // Some browsers restrict reading custom MIME types during dragover;
        // also set text/plain as a reliable fallback.
        e.dataTransfer.setData("text/plain", props.widgetType);
        e.dataTransfer.effectAllowed = "copy";
      }}
      style={{ userSelect: "none", opacity: props.disabled ? 0.5 : 1 }}
      role="button"
      tabIndex={0}
      title="Drag onto the canvas"
    >
      {props.label}
    </div>
  );
}
