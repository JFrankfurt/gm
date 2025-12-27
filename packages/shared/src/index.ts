import { z } from 'zod';

export type WorkspaceId = string;
export type NodeId = string;

export type Viewport = {
  centerX: number;
  centerY: number;
  zoom: number;
};

export type NodeType = 'frame' | 'widget' | 'guide' | 'text';

export type NodeBase = {
  id: NodeId;
  type: NodeType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  props: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FrameNode = NodeBase & {
  type: 'frame';
  props: {
    title?: string;
  };
};

export type WidgetType = 'priceChart' | 'orderEntry' | 'marketWatch' | 'plugin';

export type WidgetNode = NodeBase & {
  type: 'widget';
  props:
    | {
        widgetType: Exclude<WidgetType, 'plugin'>;
        symbol?: string;
        timeframe?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
      }
    | {
        widgetType: 'plugin';
        widgetId: string;
      };
};

export type GuideNode = NodeBase & {
  type: 'guide';
  props: {
    orientation: 'vertical' | 'horizontal';
    value: number;
  };
};

export type TextNode = NodeBase & {
  type: 'text';
  props: {
    text: string;
  };
};

export type WorkspaceNode = FrameNode | WidgetNode | GuideNode | TextNode;

export type WorkspaceDoc = {
  workspaceId: WorkspaceId;
  version: number;
  createdAt: string;
  updatedAt: string;
  viewport: Viewport;
  nodes: Record<NodeId, WorkspaceNode>;
  nodeOrder: NodeId[];
  selection: NodeId[];
};

/**
 * WorkspaceOp is the unit of synchronization (Figma-style): we sync state mutations, never pixels.
 *
 * Notes:
 * - Selection is UI-only and intentionally NOT represented as an op.
 * - `doc.version` is treated as a server-issued monotonic sequence (e.g. last applied serverSeq).
 *   Clients should not bump it optimistically; they advance it when the server acks/broadcasts.
 */
export type WorkspaceOp =
  | { opId: string; clientId: string; now: string; type: 'setViewport'; viewport: Viewport }
  | { opId: string; clientId: string; now: string; type: 'addNode'; node: WorkspaceNode }
  | { opId: string; clientId: string; now: string; type: 'updateNodeProps'; nodeId: NodeId; props: Record<string, unknown> }
  | { opId: string; clientId: string; now: string; type: 'moveNodes'; nodeIds: NodeId[]; dx: number; dy: number }
  | { opId: string; clientId: string; now: string; type: 'resizeNode'; nodeId: NodeId; x: number; y: number; w: number; h: number }
  | { opId: string; clientId: string; now: string; type: 'deleteNodes'; nodeIds: NodeId[] }
  | { opId: string; clientId: string; now: string; type: 'setNodeOrder'; nodeOrder: NodeId[] };

export const zViewport = z.object({
  centerX: z.number(),
  centerY: z.number(),
  zoom: z.number().positive(),
});

export const zNodeBase = z.object({
  id: z.string().min(1),
  type: z.enum(['frame', 'widget', 'guide', 'text']),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().optional(),
  props: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const zFrameNode = zNodeBase.extend({
  type: z.literal('frame'),
  props: z.object({ title: z.string().optional() }).passthrough(),
});

export const zWidgetNode = zNodeBase.extend({
  type: z.literal('widget'),
  props: z
    .discriminatedUnion('widgetType', [
      z
        .object({
          widgetType: z.enum(['priceChart', 'orderEntry', 'marketWatch']),
          symbol: z.string().optional(),
          timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).optional(),
        })
        .passthrough(),
      z
        .object({
          widgetType: z.literal('plugin'),
          widgetId: z.string().min(1),
        })
        .passthrough(),
    ]),
});

export const zGuideNode = zNodeBase.extend({
  type: z.literal('guide'),
  props: z.object({
    orientation: z.enum(['vertical', 'horizontal']),
    value: z.number(),
  }),
});

export const zTextNode = zNodeBase.extend({
  type: z.literal('text'),
  props: z.object({ text: z.string() }),
});

export const zWorkspaceNode = z.discriminatedUnion('type', [
  zFrameNode,
  zWidgetNode,
  zGuideNode,
  zTextNode,
]);

export const zWorkspaceDoc = z.object({
  workspaceId: z.string().min(1),
  version: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  viewport: zViewport,
  nodes: z.record(zWorkspaceNode),
  nodeOrder: z.array(z.string()),
  selection: z.array(z.string()),
});

export const zWorkspaceOp = z.discriminatedUnion('type', [
  z.object({
    opId: z.string().min(1),
    clientId: z.string().min(1),
    now: z.string().min(1),
    type: z.literal('setViewport'),
    viewport: zViewport,
  }),
  z.object({
    opId: z.string().min(1),
    clientId: z.string().min(1),
    now: z.string().min(1),
    type: z.literal('addNode'),
    node: zWorkspaceNode,
  }),
  z.object({
    opId: z.string().min(1),
    clientId: z.string().min(1),
    now: z.string().min(1),
    type: z.literal('updateNodeProps'),
    nodeId: z.string().min(1),
    props: z.record(z.unknown()),
  }),
  z.object({
    opId: z.string().min(1),
    clientId: z.string().min(1),
    now: z.string().min(1),
    type: z.literal('moveNodes'),
    nodeIds: z.array(z.string().min(1)),
    dx: z.number(),
    dy: z.number(),
  }),
  z.object({
    opId: z.string().min(1),
    clientId: z.string().min(1),
    now: z.string().min(1),
    type: z.literal('resizeNode'),
    nodeId: z.string().min(1),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
  z.object({
    opId: z.string().min(1),
    clientId: z.string().min(1),
    now: z.string().min(1),
    type: z.literal('deleteNodes'),
    nodeIds: z.array(z.string().min(1)),
  }),
  z.object({
    opId: z.string().min(1),
    clientId: z.string().min(1),
    now: z.string().min(1),
    type: z.literal('setNodeOrder'),
    nodeOrder: z.array(z.string().min(1)),
  }),
]);

export type WorkspaceAction =
  | { type: 'docLoaded'; doc: WorkspaceDoc }
  | { type: 'setViewport'; viewport: Viewport; now: string }
  | { type: 'setSelection'; selection: NodeId[]; now: string }
  | { type: 'addWidget'; node: WidgetNode; now: string }
  | { type: 'addFrame'; node: FrameNode; now: string }
  | { type: 'updateNodeProps'; nodeId: NodeId; props: Record<string, unknown>; now: string }
  | { type: 'moveNodes'; nodeIds: NodeId[]; dx: number; dy: number; now: string }
  | { type: 'resizeNode'; nodeId: NodeId; x: number; y: number; w: number; h: number; now: string }
  | { type: 'deleteNodes'; nodeIds: NodeId[]; now: string }
  | { type: 'setNodeOrder'; nodeOrder: NodeId[]; now: string }
  | { type: 'applyOp'; op: WorkspaceOp };

function updateDocTimestamp(doc: WorkspaceDoc, now: string): WorkspaceDoc {
  if (doc.updatedAt === now) return doc;
  return { ...doc, updatedAt: now };
}

export function applyWorkspaceOp(state: WorkspaceDoc, op: WorkspaceOp): WorkspaceDoc {
  switch (op.type) {
    case 'setViewport':
      return updateDocTimestamp({ ...state, viewport: op.viewport }, op.now);

    case 'addNode': {
      const node = op.node;
      return updateDocTimestamp(
        {
          ...state,
          nodes: { ...state.nodes, [node.id]: node },
          nodeOrder: [...state.nodeOrder, node.id],
          selection: state.selection,
        },
        op.now,
      );
    }

    case 'updateNodeProps': {
      const prev = state.nodes[op.nodeId];
      if (!prev) return state;
      const next: WorkspaceNode = { ...prev, props: { ...prev.props, ...op.props }, updatedAt: op.now } as WorkspaceNode;
      return updateDocTimestamp({ ...state, nodes: { ...state.nodes, [op.nodeId]: next } }, op.now);
    }

    case 'moveNodes': {
      if (op.dx === 0 && op.dy === 0) return state;
      let changed = false;
      const nextNodes = { ...state.nodes };
      for (const id of op.nodeIds) {
        const n = state.nodes[id];
        if (!n) continue;
        changed = true;
        nextNodes[id] = { ...n, x: n.x + op.dx, y: n.y + op.dy, updatedAt: op.now } as WorkspaceNode;
      }
      if (!changed) return state;
      return updateDocTimestamp({ ...state, nodes: nextNodes }, op.now);
    }

    case 'resizeNode': {
      const prev = state.nodes[op.nodeId];
      if (!prev) return state;
      const next: WorkspaceNode = { ...prev, x: op.x, y: op.y, w: op.w, h: op.h, updatedAt: op.now } as WorkspaceNode;
      return updateDocTimestamp({ ...state, nodes: { ...state.nodes, [op.nodeId]: next } }, op.now);
    }

    case 'deleteNodes': {
      const remove = new Set(op.nodeIds);
      if (remove.size === 0) return state;
      const nextNodes: Record<NodeId, WorkspaceNode> = {};
      for (const [id, n] of Object.entries(state.nodes)) {
        if (!remove.has(id)) nextNodes[id] = n;
      }
      const nextOrder = state.nodeOrder.filter((id) => !remove.has(id));
      const nextSelection = state.selection.filter((id) => !remove.has(id));
      return updateDocTimestamp({ ...state, nodes: nextNodes, nodeOrder: nextOrder, selection: nextSelection }, op.now);
    }

    case 'setNodeOrder':
      return updateDocTimestamp({ ...state, nodeOrder: op.nodeOrder }, op.now);
  }
}

export function workspaceDocReducer(state: WorkspaceDoc, action: WorkspaceAction): WorkspaceDoc {
  switch (action.type) {
    case 'docLoaded':
      return action.doc;

    case 'setViewport':
      return applyWorkspaceOp(state, {
        type: 'setViewport',
        opId: 'local',
        clientId: 'local',
        now: action.now,
        viewport: action.viewport,
      });

    case 'setSelection':
      // Selection is intentionally treated as client-only UI state.
      // We keep it in the doc shape for convenience, but do NOT bump updatedAt.
      return { ...state, selection: action.selection };

    case 'addWidget': {
      const node = action.node;
      const next = applyWorkspaceOp(state, { type: 'addNode', opId: 'local', clientId: 'local', now: action.now, node });
      return { ...next, selection: [node.id] };
    }

    case 'addFrame': {
      const node = action.node;
      const next = applyWorkspaceOp(state, { type: 'addNode', opId: 'local', clientId: 'local', now: action.now, node });
      return { ...next, selection: [node.id] };
    }

    case 'updateNodeProps': {
      return applyWorkspaceOp(state, {
        type: 'updateNodeProps',
        opId: 'local',
        clientId: 'local',
        now: action.now,
        nodeId: action.nodeId,
        props: action.props,
      });
    }

    case 'moveNodes': {
      return applyWorkspaceOp(state, {
        type: 'moveNodes',
        opId: 'local',
        clientId: 'local',
        now: action.now,
        nodeIds: action.nodeIds,
        dx: action.dx,
        dy: action.dy,
      });
    }

    case 'resizeNode': {
      return applyWorkspaceOp(state, {
        type: 'resizeNode',
        opId: 'local',
        clientId: 'local',
        now: action.now,
        nodeId: action.nodeId,
        x: action.x,
        y: action.y,
        w: action.w,
        h: action.h,
      });
    }

    case 'deleteNodes': {
      return applyWorkspaceOp(state, {
        type: 'deleteNodes',
        opId: 'local',
        clientId: 'local',
        now: action.now,
        nodeIds: action.nodeIds,
      });
    }

    case 'setNodeOrder': {
      return applyWorkspaceOp(state, {
        type: 'setNodeOrder',
        opId: 'local',
        clientId: 'local',
        now: action.now,
        nodeOrder: action.nodeOrder,
      });
    }

    case 'applyOp': {
      return applyWorkspaceOp(state, action.op);
    }
  }
}

export function createEmptyWorkspaceDoc(args: {
  workspaceId: WorkspaceId;
  now: string;
}): WorkspaceDoc {
  return {
    workspaceId: args.workspaceId,
    version: 0,
    createdAt: args.now,
    updatedAt: args.now,
    viewport: { centerX: 0, centerY: 0, zoom: 1 },
    nodes: {},
    nodeOrder: [],
    selection: [],
  };
}

/**
 * Deterministic JSON stringify for persistence and tests.
 * - Stable key ordering (lexicographic) at all object levels.
 * - Arrays keep order as-is.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(obj).sort()) out[key] = obj[key];
      return out;
    }
    return v;
  });
}

export function parseWorkspaceDoc(json: string): WorkspaceDoc {
  const parsed = JSON.parse(json) as unknown;
  return zWorkspaceDoc.parse(parsed) as WorkspaceDoc;
}
