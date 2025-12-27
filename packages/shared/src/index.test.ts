import { describe, expect, it } from 'vitest';
import {
  applyWorkspaceOp,
  createEmptyWorkspaceDoc,
  parseWorkspaceDoc,
  stableStringify,
  workspaceDocReducer,
  zWorkspaceDoc,
  zWorkspaceOp,
} from './index';

describe('WorkspaceDoc serialization', () => {
  it('roundtrips via stableStringify + parseWorkspaceDoc', () => {
    const now = new Date(0).toISOString();
    const doc = createEmptyWorkspaceDoc({ workspaceId: 'w1', now });
    const json = stableStringify(doc);
    const parsed = parseWorkspaceDoc(json);
    expect(parsed).toEqual(doc);
    expect(zWorkspaceDoc.safeParse(parsed).success).toBe(true);
  });

  it('stableStringify produces stable key ordering for objects', () => {
    const json = stableStringify({ b: 2, a: 1, nested: { z: 1, y: 2 } });
    expect(json).toBe('{"a":1,"b":2,"nested":{"y":2,"z":1}}');
  });
});

describe('workspaceDocReducer', () => {
  it('adds a widget and selects it', () => {
    const now = new Date(0).toISOString();
    const doc = createEmptyWorkspaceDoc({ workspaceId: 'w1', now });
    const next = workspaceDocReducer(doc, {
      type: 'addWidget',
      now,
      node: {
        id: 'n1',
        type: 'widget',
        x: 10,
        y: 20,
        w: 300,
        h: 200,
        props: { widgetType: 'priceChart', symbol: 'BTC-USD', timeframe: '1m' },
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(next.nodeOrder).toEqual(['n1']);
    expect(next.selection).toEqual(['n1']);
    expect(next.nodes.n1.type).toBe('widget');
  });

  it('moves nodes via dx/dy', () => {
    const now = new Date(0).toISOString();
    const doc = createEmptyWorkspaceDoc({ workspaceId: 'w1', now });
    const withWidget = workspaceDocReducer(doc, {
      type: 'addWidget',
      now,
      node: {
        id: 'n1',
        type: 'widget',
        x: 10,
        y: 20,
        w: 300,
        h: 200,
        props: { widgetType: 'marketWatch' },
        createdAt: now,
        updatedAt: now,
      },
    });

    const moved = workspaceDocReducer(withWidget, { type: 'moveNodes', nodeIds: ['n1'], dx: 5, dy: -3, now });
    expect(moved.nodes.n1.x).toBe(15);
    expect(moved.nodes.n1.y).toBe(17);
  });
});

describe('WorkspaceOp', () => {
  it('zWorkspaceOp parses a moveNodes op', () => {
    const op = zWorkspaceOp.parse({
      opId: 'op1',
      clientId: 'c1',
      now: new Date(0).toISOString(),
      type: 'moveNodes',
      nodeIds: ['n1'],
      dx: 5,
      dy: -3,
    });
    expect(op.type).toBe('moveNodes');
  });

  it('applyWorkspaceOp applies addNode', () => {
    const now = new Date(0).toISOString();
    const doc = createEmptyWorkspaceDoc({ workspaceId: 'w1', now });
    const next = applyWorkspaceOp(doc, {
      opId: 'op1',
      clientId: 'c1',
      now,
      type: 'addNode',
      node: {
        id: 'n1',
        type: 'widget',
        x: 10,
        y: 20,
        w: 300,
        h: 200,
        props: { widgetType: 'priceChart', symbol: 'BTC-USD', timeframe: '1m' },
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(next.nodeOrder).toEqual(['n1']);
    expect(next.nodes.n1.type).toBe('widget');
  });
});


