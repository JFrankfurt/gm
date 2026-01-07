import { memo } from 'react';
import { type WorkspaceDoc, type WidgetNode } from '@gm/shared';
import { type Viewport, worldToScreen } from '../canvas/viewport';
import { PriceChartWidget } from '../widgets/PriceChartWidget';
import { OrderEntryWidget } from '../widgets/OrderEntryWidget';
import { MarketWatchWidget } from '../widgets/MarketWatchWidget';
import { HyperliquidChartWidget } from '../widgets/HyperliquidChartWidget';
import { HyperliquidTradeWidget } from '../widgets/HyperliquidTradeWidget';
import { WidgetHost } from '../plugins/WidgetHost';
import { loadWidgetRegistry } from '../plugins/registry';

export function WidgetOverlayLayer(props: {
  doc: WorkspaceDoc;
  viewport: Viewport;
  width: number;
  height: number;
  dispatch: (action: import('@gm/shared').WorkspaceAction) => void;
}) {
  const registry = loadWidgetRegistry();
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {props.doc.nodeOrder.map((id) => {
        const n = props.doc.nodes[id];
        if (!n || n.type !== 'widget') return null;
        return (
          <WidgetOverlayItem
            key={id}
            node={n}
            viewport={props.viewport}
            width={props.width}
            height={props.height}
            registry={registry}
            doc={props.doc}
            dispatch={props.dispatch}
          />
        );
      })}
    </div>
  );
}

const WidgetOverlayItem = memo(function WidgetOverlayItem(props: {
  node: WidgetNode;
  viewport: Viewport;
  width: number;
  height: number;
  registry: ReturnType<typeof loadWidgetRegistry>;
  doc: WorkspaceDoc;
  dispatch: (action: import('@gm/shared').WorkspaceAction) => void;
}) {
  const { node, viewport, width, height, registry, doc, dispatch } = props;

  const tl = worldToScreen(viewport, { width, height }, { x: node.x, y: node.y });
  const br = worldToScreen(viewport, { width, height }, { x: node.x + node.w, y: node.y + node.h });

  const x = tl.x;
  const y = tl.y;
  const w = br.x - tl.x;
  const h = br.y - tl.y;

  // Built-in widgets
  if (node.props.widgetType === 'priceChart') {
  return (
    <div
      data-nodeid={node.id}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 12,
        overflow: 'hidden',
        background: 'rgba(10, 14, 24, 0.72)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>
          <PriceChartWidget symbol={node.props.symbol} timeframe={node.props.timeframe} />
        </div>
      </div>
    );
  }

  if (node.props.widgetType === 'orderEntry') {
    return (
      <div
        data-nodeid={node.id}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          borderRadius: 12,
          overflow: 'hidden',
          background: 'rgba(10, 14, 24, 0.72)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <OrderEntryWidget symbol={node.props.symbol} />
        </div>
      </div>
    );
  }

  if (node.props.widgetType === 'marketWatch') {
    return (
      <div
        data-nodeid={node.id}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          borderRadius: 12,
          overflow: 'hidden',
          background: 'rgba(10, 14, 24, 0.72)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <MarketWatchWidget />
        </div>
      </div>
    );
  }

  if (node.props.widgetType === 'hyperliquidChart') {
    return (
      <div
        data-nodeid={node.id}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          borderRadius: 12,
          overflow: 'hidden',
          background: 'rgba(10, 14, 24, 0.72)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <HyperliquidChartWidget 
            nodeId={node.id}
            symbol={node.props.symbol} 
            timeframe={node.props.timeframe}
            dispatch={dispatch}
          />
        </div>
      </div>
    );
  }

  if (node.props.widgetType === 'hyperliquidTrade') {
    return (
      <div
        data-nodeid={node.id}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          borderRadius: 12,
          overflow: 'hidden',
          background: 'rgba(10, 14, 24, 0.72)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <HyperliquidTradeWidget 
            nodeId={node.id}
            symbol={node.props.symbol}
            dispatch={dispatch}
          />
        </div>
      </div>
    );
  }

  // Plugin widgets (iframe)
  if (node.props.widgetType === 'plugin') {
    const widgetId = (node.props as { widgetId: string }).widgetId;
    const installed = registry.installed[widgetId];
    if (!installed) {
      return (
        <div
          data-nodeid={node.id}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            width: w,
            height: h,
            borderRadius: 12,
            overflow: 'hidden',
            background: 'rgba(10, 14, 24, 0.72)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center', padding: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Widget Not Installed</div>
            <div className="mono" style={{ fontSize: 12, opacity: 0.8 }}>
              widgetId={widgetId}
            </div>
      </div>
    </div>
  );
    }

    return (
      <WidgetHost
        node={node}
        installed={installed}
        doc={doc}
        viewport={viewport}
        width={width}
        height={height}
      />
    );
  }

  return null;
});
