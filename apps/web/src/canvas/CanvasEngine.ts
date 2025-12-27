import { RectRenderer, type RectBatchItem } from './RectRenderer';
import { requireWebGL2 } from './gl';
import { type Viewport as ViewportModel, worldToScreen } from './viewport';
import { type WorkspaceDoc } from '@gm/shared';

export class CanvasEngine {
  private gl: WebGL2RenderingContext;
  private rects: RectRenderer;

  constructor(private canvas: HTMLCanvasElement) {
    this.gl = requireWebGL2(canvas);
    this.rects = new RectRenderer(this.gl);
  }

  destroy() {
    this.rects.destroy();
  }

  resize(args: { width: number; height: number; dpr: number }) {
    const { canvas } = this;
    canvas.width = Math.max(1, Math.floor(args.width * args.dpr));
    canvas.height = Math.max(1, Math.floor(args.height * args.dpr));
    canvas.style.width = `${args.width}px`;
    canvas.style.height = `${args.height}px`;
    this.gl.viewport(0, 0, canvas.width, canvas.height);
  }

  render(args: {
    doc: WorkspaceDoc;
    viewport: ViewportModel;
    width: number;
    height: number;
    dpr: number;
    ghostWorldRect?: { x: number; y: number; w: number; h: number } | null;
  }): number {
    const t0 = performance.now();
    const { gl } = this;
    const { doc, viewport, width, height } = args;

    // Important: draw in CSS pixel coordinates so WebGL visuals (frames/handles/grid)
    // align perfectly with the DOM overlay, while the canvas backing store remains DPR-scaled.
    // The shader converts CSS pixel coords to clip-space using u_resolution (CSS px),
    // then the GPU rasterizes into the DPR-sized viewport for crisp rendering.
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.drawWorldGrid({ viewport, width, height });

    const rectItems: RectBatchItem[] = [];
    const selectionItems: RectBatchItem[] = [];

    // Node frames (world->screen via viewport)
    for (const id of doc.nodeOrder) {
      const n = doc.nodes[id];
      if (!n) continue;

      const topLeft = worldToScreen(viewport, { width, height }, { x: n.x, y: n.y });
      const bottomRight = worldToScreen(viewport, { width, height }, { x: n.x + n.w, y: n.y + n.h });

      const x = topLeft.x;
      const y = topLeft.y;
      const w = bottomRight.x - topLeft.x;
      const h = bottomRight.y - topLeft.y;

      // base panel fill
      rectItems.push({ x, y, w, h, r: 0.08, g: 0.11, b: 0.18, a: 0.75 });

      // border via 4 thin rects
      const b = 1.5;
      rectItems.push({ x, y, w, h: b, r: 0.25, g: 0.32, b: 0.45, a: 0.9 });
      rectItems.push({ x, y: y + h - b, w, h: b, r: 0.25, g: 0.32, b: 0.45, a: 0.9 });
      rectItems.push({ x, y, w: b, h, r: 0.25, g: 0.32, b: 0.45, a: 0.9 });
      rectItems.push({ x: x + w - b, y, w: b, h, r: 0.25, g: 0.32, b: 0.45, a: 0.9 });

      if (doc.selection.includes(id)) {
        const s = 2.0;
        const c = { r: 0.35, g: 0.65, b: 1.0, a: 1.0 };
        selectionItems.push({ x: x - s, y: y - s, w: w + 2 * s, h: s, ...c });
        selectionItems.push({ x: x - s, y: y + h, w: w + 2 * s, h: s, ...c });
        selectionItems.push({ x: x - s, y: y - s, w: s, h: h + 2 * s, ...c });
        selectionItems.push({ x: x + w, y: y - s, w: s, h: h + 2 * s, ...c });

        // simple corner handles
        const hs = 6;
        const handle = { r: 0.95, g: 0.97, b: 1.0, a: 1.0 };
        selectionItems.push({ x: x - hs, y: y - hs, w: hs * 2, h: hs * 2, ...handle });
        selectionItems.push({ x: x + w - hs, y: y - hs, w: hs * 2, h: hs * 2, ...handle });
        selectionItems.push({ x: x - hs, y: y + h - hs, w: hs * 2, h: hs * 2, ...handle });
        selectionItems.push({ x: x + w - hs, y: y + h - hs, w: hs * 2, h: hs * 2, ...handle });
      }
    }

    this.rects.draw({ items: rectItems, resolution: { width, height } });
    this.rects.draw({ items: selectionItems, resolution: { width, height } });

    // Ghost preview for drag/drop (dashed-ish via alpha rects)
    if (args.ghostWorldRect) {
      const g = args.ghostWorldRect;
      const tl = worldToScreen(viewport, { width, height }, { x: g.x, y: g.y });
      const br = worldToScreen(viewport, { width, height }, { x: g.x + g.w, y: g.y + g.h });
      const x = tl.x;
      const y = tl.y;
      const w = br.x - tl.x;
      const h = br.y - tl.y;
      const t = 2.0;
      const c = { r: 0.9, g: 0.95, b: 1.0, a: 0.7 };
      this.rects.draw({
        items: [
          { x, y, w, h: t, ...c },
          { x, y: y + h - t, w, h: t, ...c },
          { x, y, w: t, h, ...c },
          { x: x + w - t, y, w: t, h, ...c },
        ],
        resolution: { width, height },
      });
    }

    const ms = performance.now() - t0;
    return ms;
  }

  private drawWorldGrid(args: { viewport: ViewportModel; width: number; height: number }) {
    const { viewport, width, height } = args;

    // World-space grid tuned for a “trading dashboard canvas” feel.
    const minor = 100; // world units
    const majorEvery = 5;

    const halfWWorld = width / viewport.zoom / 2;
    const halfHWorld = height / viewport.zoom / 2;

    const left = viewport.centerX - halfWWorld;
    const right = viewport.centerX + halfWWorld;
    const top = viewport.centerY - halfHWorld;
    const bottom = viewport.centerY + halfHWorld;

    const startX = Math.floor(left / minor) * minor;
    const startY = Math.floor(top / minor) * minor;

    const lines: RectBatchItem[] = [];
    const thickness = 1;

    // Cap to avoid pathological zoom-out producing too many lines.
    const maxLines = 300;
    let count = 0;

    // vertical lines
    for (let x = startX; x <= right && count < maxLines; x += minor) {
      const s = worldToScreen(viewport, { width, height }, { x, y: viewport.centerY });
      const isMajor = Math.round(x / minor) % majorEvery === 0;
      const a = isMajor ? 0.12 : 0.06;
      lines.push({ x: Math.floor(s.x), y: 0, w: thickness, h: height, r: 1, g: 1, b: 1, a });
      count++;
    }

    // horizontal lines
    for (let y = startY; y <= bottom && count < maxLines; y += minor) {
      const s = worldToScreen(viewport, { width, height }, { x: viewport.centerX, y });
      const isMajor = Math.round(y / minor) % majorEvery === 0;
      const a = isMajor ? 0.12 : 0.06;
      lines.push({ x: 0, y: Math.floor(s.y), w: width, h: thickness, r: 1, g: 1, b: 1, a });
      count++;
    }

    if (lines.length) {
      this.rects.draw({ items: lines, resolution: { width, height } });
    }
  }
}
