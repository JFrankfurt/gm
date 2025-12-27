import { type PerfStats } from '../hooks/useFps';

export function PerfOverlay(props: { stats: PerfStats; nodeCount: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        right: 10,
        bottom: 10,
        padding: '10px 12px',
        borderRadius: 12,
        background: 'rgba(0,0,0,0.55)',
        border: '1px solid rgba(255,255,255,0.12)',
        color: 'rgba(255,255,255,0.92)',
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 12,
        lineHeight: 1.4,
        pointerEvents: 'none',
      }}
    >
      <div>FPS: {props.stats.fps}</div>
      <div>render: {formatMs(props.stats.renderMs)}</div>
      <div>hitTest: {formatMs(props.stats.hitTestMs)}</div>
      <div>reducer: {formatMs(props.stats.reducerMs)}</div>
      <div>nodes: {props.nodeCount}</div>
    </div>
  );
}

function formatMs(v: number | null): string {
  if (v == null) return '—';
  return `${v.toFixed(2)}ms`;
}
