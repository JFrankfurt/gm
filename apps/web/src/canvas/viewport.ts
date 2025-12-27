export type Viewport = {
  centerX: number;
  centerY: number;
  zoom: number;
};

export type Size = { width: number; height: number };
export type Vec2 = { x: number; y: number };

export function worldToScreen(vp: Viewport, size: Size, p: Vec2): Vec2 {
  const sx = (p.x - vp.centerX) * vp.zoom + size.width / 2;
  const sy = (p.y - vp.centerY) * vp.zoom + size.height / 2;
  return { x: sx, y: sy };
}

export function screenToWorld(vp: Viewport, size: Size, p: Vec2): Vec2 {
  const wx = (p.x - size.width / 2) / vp.zoom + vp.centerX;
  const wy = (p.y - size.height / 2) / vp.zoom + vp.centerY;
  return { x: wx, y: wy };
}

/**
 * Wheel zoom around a screen-space anchor (cursor position).
 * Keeps the world point under the cursor stable while zooming.
 */
export function zoomAroundScreenPoint(args: {
  viewport: Viewport;
  size: Size;
  screenPoint: Vec2;
  nextZoom: number;
}): Viewport {
  const { viewport, size, screenPoint, nextZoom } = args;

  const before = screenToWorld(viewport, size, screenPoint);
  const after = screenToWorld({ ...viewport, zoom: nextZoom }, size, screenPoint);

  return {
    centerX: viewport.centerX + (before.x - after.x),
    centerY: viewport.centerY + (before.y - after.y),
    zoom: nextZoom,
  };
}

export function clampZoom(z: number): number {
  return Math.min(6, Math.max(0.1, z));
}
