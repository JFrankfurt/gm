import { useEffect, useMemo, useRef, useState } from 'react';
import { type WorkspaceDoc } from '@gm/shared';
import { buildSpatialIndex, pickRect, pickTopmost } from '../canvas/spatialIndex';
import { clampZoom, type Viewport, zoomAroundScreenPoint } from '../canvas/viewport';
import { useElementSize } from '../hooks/useElementSize';
import { CanvasView } from './CanvasView';
import { WidgetOverlayLayer } from './WidgetOverlayLayer';
import type { WorkspaceAction } from '@gm/shared';
import { worldToScreen } from '../canvas/viewport';

export function WorkspaceStage(props: {
  doc: WorkspaceDoc;
  viewport: Viewport;
  dispatch: (action: WorkspaceAction) => void;
  readOnly?: boolean;
  snapToGrid?: boolean;
  gridSize?: number;
  onPerf?: (p: { renderMs?: number; hitTestMs?: number }) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const size = useElementSize(hostRef);
  const dpr = window.devicePixelRatio || 1;

  const spatial = useMemo(() => buildSpatialIndex(props.doc), [props.doc]);

  const viewportRef = useRef(props.viewport);
  useEffect(() => {
    viewportRef.current = props.viewport;
  }, [props.viewport]);

  const isSpaceDown = useRef(false);
  const mode = useRef<'none' | 'panning' | 'dragging' | 'resizing'>('none');
  const activePointerId = useRef<number | null>(null);

  const panStart = useRef<{ x: number; y: number; centerX: number; centerY: number } | null>(null);

  const dragStart = useRef<{
    worldX: number;
    worldY: number;
    selection: string[];
    anchorX: number;
    anchorY: number;
    lastAppliedDx: number;
    lastAppliedDy: number;
  } | null>(null);

  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const resizeStart = useRef<{
    nodeId: string;
    corner: 'nw' | 'ne' | 'sw' | 'se';
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const rafPending = useRef(false);
  const pending = useRef<{ dx: number; dy: number } | null>(null);
  const pendingPan = useRef<{ dx: number; dy: number } | null>(null);
  const pendingResize = useRef<{ nodeId: string; x: number; y: number; w: number; h: number } | null>(null);

  const [ghostWorldRect, setGhostWorldRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const gridSize = props.gridSize ?? 20;
  const snap = (v: number) => (props.snapToGrid ? Math.round(v / gridSize) * gridSize : v);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space') isSpaceDown.current = true;
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') isSpaceDown.current = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    if (props.readOnly) return;
    const dispatch = props.dispatch;
    const selectedIds = props.doc.selection;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      if (selectedIds.length === 0) return;
      // Avoid killing input focus.
      if (document.activeElement && document.activeElement.closest('input,textarea,select,[contenteditable=true]')) return;
      e.preventDefault();
      dispatch({ type: 'deleteNodes', nodeIds: selectedIds, now: new Date().toISOString() });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [props.readOnly, props.doc.selection, props.dispatch]);

  function screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const el = hostRef.current;
    const vp = viewportRef.current;
    if (!el) return { x: vp.centerX, y: vp.centerY };

    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    const worldX = (px - rect.width / 2) / vp.zoom + vp.centerX;
    const worldY = (py - rect.height / 2) / vp.zoom + vp.centerY;
    return { x: worldX, y: worldY };
  }

  function nodeScreenRect(nodeId: string): { x: number; y: number; w: number; h: number } | null {
    const n = props.doc.nodes[nodeId];
    if (!n) return null;
    const vp = viewportRef.current;
    const tl = worldToScreen(vp, { width: size.width, height: size.height }, { x: n.x, y: n.y });
    const br = worldToScreen(vp, { width: size.width, height: size.height }, { x: n.x + n.w, y: n.y + n.h });
    return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
  }

  function localPointFromClient(clientX: number, clientY: number): { x: number; y: number } | null {
    const el = hostRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function hitResizeHandle(nodeId: string, local: { x: number; y: number }): 'nw' | 'ne' | 'sw' | 'se' | null {
    const r = nodeScreenRect(nodeId);
    if (!r) return null;
    // Matches CanvasEngine visual handles (~12px squares).
    const hs = 12;
    const corners = [
      { corner: 'nw' as const, cx: r.x, cy: r.y },
      { corner: 'ne' as const, cx: r.x + r.w, cy: r.y },
      { corner: 'sw' as const, cx: r.x, cy: r.y + r.h },
      { corner: 'se' as const, cx: r.x + r.w, cy: r.y + r.h },
    ];
    for (const c of corners) {
      if (Math.abs(local.x - c.cx) <= hs && Math.abs(local.y - c.cy) <= hs) return c.corner;
    }
    return null;
  }

  function isFormControl(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input,textarea,select,button'));
  }

  function scheduleApply() {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      const vp = viewportRef.current;

      if (pendingPan.current && panStart.current) {
        const dx = pendingPan.current.dx;
        const dy = pendingPan.current.dy;
        pendingPan.current = null;
        props.dispatch({
          type: 'setViewport',
          viewport: {
            ...vp,
            centerX: panStart.current.centerX - dx / vp.zoom,
            centerY: panStart.current.centerY - dy / vp.zoom,
          },
          now: new Date().toISOString(),
        });
      }

      if (pending.current && dragStart.current) {
        if (props.readOnly) {
          pending.current = null;
          return;
        }
        const nextDx = pending.current.dx;
        const nextDy = pending.current.dy;
        pending.current = null;

        const diffDx = nextDx - dragStart.current.lastAppliedDx;
        const diffDy = nextDy - dragStart.current.lastAppliedDy;
        dragStart.current.lastAppliedDx = nextDx;
        dragStart.current.lastAppliedDy = nextDy;

        if (diffDx !== 0 || diffDy !== 0) {
          props.dispatch({
            type: 'moveNodes',
            nodeIds: dragStart.current.selection,
            dx: diffDx,
            dy: diffDy,
            now: new Date().toISOString(),
          });
        }
      }

      if (pendingResize.current) {
        if (props.readOnly) {
          pendingResize.current = null;
          return;
        }
        const r = pendingResize.current;
        pendingResize.current = null;
        props.dispatch({ type: 'resizeNode', nodeId: r.nodeId, x: r.x, y: r.y, w: r.w, h: r.h, now: new Date().toISOString() });
      }
    });
  }

  return (
    <div
      ref={hostRef}
      style={{ position: 'absolute', inset: 0 }}
      onDragEnter={(e) => {
        if (props.readOnly) return;
        // Accept our palette drags.
        const t = e.dataTransfer.types;
        if (t && Array.from(t).includes('application/x-gm-widget')) {
          e.preventDefault();
        }
      }}
      onDragOver={(e) => {
        if (props.readOnly) return;
        const t = e.dataTransfer.types;
        if (!t || !Array.from(t).includes('application/x-gm-widget')) return;
        e.preventDefault();

        const type =
          e.dataTransfer.getData('application/x-gm-widget') ||
          e.dataTransfer.getData('text/plain');
        if (!type) return;

        const w = screenToWorld(e.clientX, e.clientY);
        // preview size based on widget type
        const sizeFor = (widgetType: string) => {
          if (widgetType === 'orderEntry') return { w: 360, h: 280 };
          if (widgetType === 'marketWatch') return { w: 440, h: 320 };
          return { w: 400, h: 240 };
        };
        const s = sizeFor(type);
        setGhostWorldRect({ x: w.x - s.w / 2, y: w.y - s.h / 2, w: s.w, h: s.h });
      }}
      onDragLeave={() => {
        setGhostWorldRect(null);
      }}
      onDrop={(e) => {
        if (props.readOnly) return;
        const type =
          e.dataTransfer.getData('application/x-gm-widget') ||
          e.dataTransfer.getData('text/plain');
        if (!type) return;
        e.preventDefault();

        const w = screenToWorld(e.clientX, e.clientY);
        const now = new Date().toISOString();

        const sizeFor = (widgetType: string) => {
          if (widgetType === 'orderEntry') return { w: 360, h: 280 };
          if (widgetType === 'marketWatch') return { w: 440, h: 320 };
          return { w: 400, h: 240 };
        };
        const s = sizeFor(type);

        props.dispatch({
          type: 'addWidget',
          now,
          node: {
            id: crypto.randomUUID(),
            type: 'widget',
            x: w.x - s.w / 2,
            y: w.y - s.h / 2,
            w: s.w,
            h: s.h,
            props:
              type === 'priceChart'
                ? { widgetType: 'priceChart', symbol: 'BTC-USD', timeframe: '1m' }
                : type === 'orderEntry'
                  ? { widgetType: 'orderEntry', symbol: 'ETH-USD' }
                  : { widgetType: 'marketWatch' },
            createdAt: now,
            updatedAt: now,
          },
        });

        setGhostWorldRect(null);
      }}
      onWheel={(e) => {
        e.preventDefault();
        if (!hostRef.current) return;

        const rect = hostRef.current.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;

        const vp = viewportRef.current;
        const nextZoom = clampZoom(vp.zoom * Math.pow(1.0015, -e.deltaY));
        const next = zoomAroundScreenPoint({
          viewport: vp,
          size: { width: rect.width, height: rect.height },
          screenPoint: { x: localX, y: localY },
          nextZoom,
        });
        props.dispatch({ type: 'setViewport', viewport: next, now: new Date().toISOString() });
      }}
      onPointerDownCapture={(e) => {
        if (e.button !== 0) return;
        if (!hostRef.current) return;

        hostRef.current.setPointerCapture(e.pointerId);
        activePointerId.current = e.pointerId;

        if (isSpaceDown.current) {
          mode.current = 'panning';
          const vp = viewportRef.current;
          panStart.current = { x: e.clientX, y: e.clientY, centerX: vp.centerX, centerY: vp.centerY };
          return;
        }

        // allow widget internal UI to work without moving/selecting
        if (isFormControl(e.target)) return;

        const w = screenToWorld(e.clientX, e.clientY);
        const ht0 = performance.now();
        const hit = pickTopmost(spatial, w.x, w.y);
        props.onPerf?.({ hitTestMs: performance.now() - ht0 });

        // Shift-click: toggle only (no drag/resize).
        if (e.shiftKey) {
          const set = new Set(props.doc.selection);
          if (hit) {
            if (set.has(hit)) set.delete(hit);
            else set.add(hit);
          }
          props.dispatch({ type: 'setSelection', selection: [...set], now: new Date().toISOString() });
          mode.current = 'none';
          return;
        }

        if (!hit) {
          props.dispatch({ type: 'setSelection', selection: [], now: new Date().toISOString() });
          mode.current = 'none';
          if (!props.readOnly) {
            marqueeStart.current = { x: w.x, y: w.y };
            setMarquee({ x: w.x, y: w.y, w: 0, h: 0 });
          }
          return;
        }

        // If the click hits a node, select it (if not already selected).
        const nextSelection = props.doc.selection.includes(hit) ? props.doc.selection : [hit];
        if (nextSelection !== props.doc.selection) {
          props.dispatch({ type: 'setSelection', selection: nextSelection, now: new Date().toISOString() });
        }

        if (props.readOnly) {
          mode.current = 'none';
          return;
        }

        const local = localPointFromClient(e.clientX, e.clientY);
        if (local && nextSelection.length === 1) {
          const corner = hitResizeHandle(nextSelection[0], local);
          if (corner) {
            const n = props.doc.nodes[nextSelection[0]];
            if (n) {
              mode.current = 'resizing';
              resizeStart.current = { nodeId: n.id, corner, x: n.x, y: n.y, w: n.w, h: n.h };
              return;
            }
          }
        }

        // Otherwise, start dragging selection.
        mode.current = 'dragging';
        const anchor = props.doc.nodes[nextSelection[0]];
        dragStart.current = {
          worldX: w.x,
          worldY: w.y,
          selection: nextSelection,
          anchorX: anchor?.x ?? 0,
          anchorY: anchor?.y ?? 0,
          lastAppliedDx: 0,
          lastAppliedDy: 0,
        };
      }}
      onPointerMoveCapture={(e) => {
        if (activePointerId.current !== e.pointerId) return;

        if (marqueeStart.current && !props.readOnly) {
          const w = screenToWorld(e.clientX, e.clientY);
          const x0 = marqueeStart.current.x;
          const y0 = marqueeStart.current.y;
          const minX = Math.min(x0, w.x);
          const minY = Math.min(y0, w.y);
          const maxX = Math.max(x0, w.x);
          const maxY = Math.max(y0, w.y);
          setMarquee({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
          return;
        }

        if (mode.current === 'panning' && panStart.current) {
          const dx = e.clientX - panStart.current.x;
          const dy = e.clientY - panStart.current.y;
          pendingPan.current = { dx, dy };
          scheduleApply();
          return;
        }

        if (mode.current === 'dragging' && dragStart.current) {
          const w = screenToWorld(e.clientX, e.clientY);
          let dx = w.x - dragStart.current.worldX;
          let dy = w.y - dragStart.current.worldY;
          if (props.snapToGrid) {
            dx = snap(dragStart.current.anchorX + dx) - dragStart.current.anchorX;
            dy = snap(dragStart.current.anchorY + dy) - dragStart.current.anchorY;
          }
          pending.current = { dx, dy };
          scheduleApply();
          return;
        }

        if (mode.current === 'resizing' && resizeStart.current) {
          const w = screenToWorld(e.clientX, e.clientY);
          const r0 = resizeStart.current;
          const minW = 160;
          const minH = 100;

          const x0 = r0.x;
          const y0 = r0.y;
          const x1 = r0.x + r0.w;
          const y1 = r0.y + r0.h;

          let nx0 = x0;
          let ny0 = y0;
          let nx1 = x1;
          let ny1 = y1;

          if (r0.corner === 'se') {
            nx1 = Math.max(x0 + minW, w.x);
            ny1 = Math.max(y0 + minH, w.y);
          } else if (r0.corner === 'nw') {
            nx0 = Math.min(x1 - minW, w.x);
            ny0 = Math.min(y1 - minH, w.y);
          } else if (r0.corner === 'ne') {
            nx1 = Math.max(x0 + minW, w.x);
            ny0 = Math.min(y1 - minH, w.y);
          } else if (r0.corner === 'sw') {
            nx0 = Math.min(x1 - minW, w.x);
            ny1 = Math.max(y0 + minH, w.y);
          }

          if (props.snapToGrid) {
            if (r0.corner === 'se' || r0.corner === 'ne') nx1 = snap(nx1);
            if (r0.corner === 'se' || r0.corner === 'sw') ny1 = snap(ny1);
            if (r0.corner === 'nw' || r0.corner === 'sw') nx0 = snap(nx0);
            if (r0.corner === 'nw' || r0.corner === 'ne') ny0 = snap(ny0);
          }

          const next = { nodeId: r0.nodeId, x: nx0, y: ny0, w: nx1 - nx0, h: ny1 - ny0 };
          pendingResize.current = next;
          scheduleApply();
        }
      }}
      onPointerUpCapture={() => {
        mode.current = 'none';
        activePointerId.current = null;
        panStart.current = null;
        dragStart.current = null;
        resizeStart.current = null;
        pending.current = null;
        pendingPan.current = null;
        pendingResize.current = null;
        if (marqueeStart.current && marquee) {
          const ids = pickRect(spatial, { minX: marquee.x, minY: marquee.y, maxX: marquee.x + marquee.w, maxY: marquee.y + marquee.h });
          props.dispatch({ type: 'setSelection', selection: ids, now: new Date().toISOString() });
        }
        marqueeStart.current = null;
        setMarquee(null);
      }}
      onPointerCancelCapture={() => {
        mode.current = 'none';
        activePointerId.current = null;
        panStart.current = null;
        dragStart.current = null;
        resizeStart.current = null;
        pending.current = null;
        pendingPan.current = null;
        pendingResize.current = null;
        marqueeStart.current = null;
        setMarquee(null);
      }}
    >
      {size.width > 0 && size.height > 0 && (
        <>
          <CanvasView
            doc={props.doc}
            viewport={props.viewport}
            width={size.width}
            height={size.height}
            dpr={dpr}
            ghostWorldRect={ghostWorldRect}
            onRenderMs={(ms) => props.onPerf?.({ renderMs: ms })}
          />
          <WidgetOverlayLayer doc={props.doc} viewport={props.viewport} width={size.width} height={size.height} />
        </>
      )}
      {marquee && (
        <div
          style={{
            position: 'absolute',
            left: worldToScreen(props.viewport, { width: size.width, height: size.height }, { x: marquee.x, y: marquee.y }).x,
            top: worldToScreen(props.viewport, { width: size.width, height: size.height }, { x: marquee.x, y: marquee.y }).y,
            width: marquee.w * props.viewport.zoom,
            height: marquee.h * props.viewport.zoom,
            border: '1px solid rgba(120,180,255,0.9)',
            background: 'rgba(120,180,255,0.12)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}
