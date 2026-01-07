import { z } from 'zod';
import { allCapabilities, type Capability } from './permissions';
import type { WorkspaceDoc } from '@gm/shared';

export const PROTOCOL_VERSION = '1.0.0';

export type WidgetContext = {
  user: {
    viewerId: string;
    displayName?: string;
  };
  workspace: {
    workspaceId: string;
    version: number;
  };
  node: {
    nodeId: string;
    props: Record<string, unknown>;
  };
  client: {
    platformType: 'web' | 'mobile';
  };
};

export type HostInitMessage = {
  type: 'gm:init';
  widgetInstanceId: string;
  protocolVersion: string;
  context: WidgetContext;
  grantedCaps: Capability[];
};

export type WidgetReadyMessage = {
  type: 'gm:ready';
  protocolVersion: string;
};

export type RpcRequestMessage = {
  type: 'gm:rpc:req';
  id: string;
  method: string;
  params?: unknown;
};

export type RpcResponseMessage = {
  type: 'gm:rpc:res';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
};

export type EventMessage = {
  type: 'gm:evt';
  name: string;
  payload?: unknown;
};

export type WidgetMessage = HostInitMessage | WidgetReadyMessage | RpcRequestMessage | RpcResponseMessage | EventMessage;

export const zHostInitMessage = z.object({
  type: z.literal('gm:init'),
  widgetInstanceId: z.string().min(1),
  protocolVersion: z.string().min(1),
  context: z.object({
    user: z.object({
      viewerId: z.string().min(1),
      displayName: z.string().optional(),
    }),
    workspace: z.object({
      workspaceId: z.string().min(1),
      version: z.number().int().nonnegative(),
    }),
    node: z.object({
      nodeId: z.string().min(1),
      props: z.record(z.unknown()),
    }),
    client: z.object({
      platformType: z.enum(['web', 'mobile']),
    }),
  }),
  grantedCaps: z.array(z.enum(allCapabilities)),
});

export const zWidgetReadyMessage = z.object({
  type: z.literal('gm:ready'),
  protocolVersion: z.string().min(1),
});

export const zRpcRequestMessage = z.object({
  type: z.literal('gm:rpc:req'),
  id: z.string().min(1),
  method: z.string().min(1),
  params: z.unknown().optional().default({}),
});

export const zRpcResponseMessage = z.object({
  type: z.literal('gm:rpc:res'),
  id: z.string().min(1),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

export const zEventMessage = z.object({
  type: z.literal('gm:evt'),
  name: z.string().min(1),
  payload: z.unknown().optional(),
});

export const zWidgetMessage = z.discriminatedUnion('type', [
  zHostInitMessage,
  zWidgetReadyMessage,
  zRpcRequestMessage,
  zRpcResponseMessage,
  zEventMessage,
]);

export function parseWidgetMessage(input: unknown): WidgetMessage {
  return zWidgetMessage.parse(input);
}

export function createWidgetContext(args: {
  viewerId: string;
  doc: WorkspaceDoc;
  nodeId: string;
}): WidgetContext {
  const node = args.doc.nodes[args.nodeId];
  return {
    user: {
      viewerId: args.viewerId,
    },
    workspace: {
      workspaceId: args.doc.workspaceId,
      version: args.doc.version,
    },
    node: {
      nodeId: args.nodeId,
      props: node?.props ?? {},
    },
    client: {
      platformType: 'web',
    },
  };
}

