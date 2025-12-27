import RBush from "rbush";
import { type WorkspaceDoc } from "@gm/shared";

export type SpatialItem = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
  order: number;
};

export type SpatialIndex = {
  tree: RBush<SpatialItem>;
  idToOrder: Map<string, number>;
};

export function buildSpatialIndex(doc: WorkspaceDoc): SpatialIndex {
  const tree = new RBush<SpatialItem>();
  const idToOrder = new Map<string, number>();

  const items: SpatialItem[] = [];
  for (let i = 0; i < doc.nodeOrder.length; i++) {
    const id = doc.nodeOrder[i];
    const n = doc.nodes[id];
    if (!n) continue;
    idToOrder.set(id, i);
    items.push({
      minX: n.x,
      minY: n.y,
      maxX: n.x + n.w,
      maxY: n.y + n.h,
      id,
      order: i,
    });
  }

  tree.load(items);
  return { tree, idToOrder };
}

export function pickTopmost(
  index: SpatialIndex,
  worldX: number,
  worldY: number
): string | null {
  const hits = index.tree.search({
    minX: worldX,
    minY: worldY,
    maxX: worldX,
    maxY: worldY,
  });
  if (hits.length === 0) return null;

  let best: SpatialItem | null = null;
  for (const h of hits) {
    if (!best || h.order > best.order) best = h;
  }
  return best?.id ?? null;
}

export function pickRect(
  index: SpatialIndex,
  rect: { minX: number; minY: number; maxX: number; maxY: number }
): string[] {
  const hits = index.tree.search(rect);
  // Return sorted by z-order so selection order is stable.
  hits.sort((a, b) => a.order - b.order);
  return hits.map((h) => h.id);
}
