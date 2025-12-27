import { useEffect, useRef, useState } from 'react';
import type { WidgetNode, WorkspaceDoc } from '@gm/shared';
import type { Viewport } from '../canvas/viewport';
import { worldToScreen } from '../canvas/viewport';
import { PROTOCOL_VERSION, createWidgetContext, parseWidgetMessage, type RpcRequestMessage, type WidgetMessage } from './protocol';
import type { InstalledWidget } from './registry';
import { getViewerIdFromUrl } from '../auth/identity';

export function WidgetHost(props: {
  node: WidgetNode;
  installed: InstalledWidget;
  doc: WorkspaceDoc;
  viewport: Viewport;
  width: number;
  height: number;
  onRpcRequest?: (req: RpcRequestMessage) => Promise<unknown>;
}) {
  const { node, installed, doc, viewport, width, height, onRpcRequest } = props;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const pendingRpcRef = useRef<Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>>(new Map());
  const viewerId = getViewerIdFromUrl() ?? 'anon';

  const tl = worldToScreen(viewport, { width, height }, { x: node.x, y: node.y });
  const br = worldToScreen(viewport, { width, height }, { x: node.x + node.w, y: node.y + node.h });

  const x = tl.x;
  const y = tl.y;
  const w = br.x - tl.x;
  const h = br.y - tl.y;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) return;

    function onMessage(evt: MessageEvent) {
      const currentIframe = iframeRef.current;
      if (!currentIframe || evt.source !== currentIframe.contentWindow) return;
      if (typeof evt.data !== 'object' || evt.data === null) return;

      try {
        const msg = parseWidgetMessage(evt.data);
        if (msg.type === 'gm:ready') {
          setReady(true);
          const currentIframe = iframeRef.current;
          if (!currentIframe?.contentWindow) return;
          const context = createWidgetContext({ viewerId, doc, nodeId: node.id });
          currentIframe.contentWindow.postMessage(
            {
              type: 'gm:init',
              widgetInstanceId: node.id,
              protocolVersion: PROTOCOL_VERSION,
              context,
              grantedCaps: installed.granted,
            } satisfies WidgetMessage,
            '*',
          );
          return;
        }

        if (msg.type === 'gm:rpc:res') {
          const pending = pendingRpcRef.current.get(msg.id);
          if (pending) {
            pendingRpcRef.current.delete(msg.id);
            if (msg.ok) {
              pending.resolve(msg.result);
            } else {
              pending.reject(new Error(msg.error?.message ?? 'RPC error'));
            }
          }
          return;
        }

        if (msg.type === 'gm:rpc:req' && onRpcRequest) {
          const currentIframe = iframeRef.current;
          if (!currentIframe?.contentWindow) return;
          onRpcRequest(msg)
            .then((result) => {
              const iframe = iframeRef.current;
              if (!iframe?.contentWindow) return;
              iframe.contentWindow.postMessage(
                {
                  type: 'gm:rpc:res',
                  id: msg.id,
                  ok: true,
                  result,
                } satisfies WidgetMessage,
                '*',
              );
            })
            .catch((err) => {
              const iframe = iframeRef.current;
              if (!iframe?.contentWindow) return;
              iframe.contentWindow.postMessage(
                {
                  type: 'gm:rpc:res',
                  id: msg.id,
                  ok: false,
                  error: {
                    code: 'INTERNAL_ERROR',
                    message: err instanceof Error ? err.message : String(err),
                  },
                } satisfies WidgetMessage,
                '*',
              );
            });
          return;
        }
      } catch {
        // ignore malformed messages
      }
    }

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      pendingRpcRef.current.clear();
    };
  }, [node.id, doc, viewerId, installed.granted, onRpcRequest]);

  useEffect(() => {
    if (!ready) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) return;

    const context = createWidgetContext({ viewerId, doc, nodeId: node.id });
    iframeWindow.postMessage(
      {
        type: 'gm:init',
        widgetInstanceId: node.id,
        protocolVersion: PROTOCOL_VERSION,
        context,
        grantedCaps: installed.granted,
      } satisfies WidgetMessage,
      '*',
    );
  }, [ready, node.id, node.props, doc.version, viewerId, installed.granted]);

  return (
    <iframe
      ref={iframeRef}
      src={installed.manifest.entry.url}
      sandbox="allow-scripts allow-forms"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        border: 'none',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'rgba(10, 14, 24, 0.72)',
      }}
      title={installed.manifest.name}
    />
  );
}

