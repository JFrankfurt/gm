import { useEffect, useMemo, useRef, useState } from 'react';
import { useHyperliquidSeries } from '../data/useHyperliquidSeries';
import type { WorkspaceAction } from '@gm/shared';

const AVAILABLE_SYMBOLS = ['BTC', 'ETH', 'SOL', 'DOGE', 'ARB', 'MATIC', 'AVAX', 'LINK', 'UNI', 'AAVE'];
const AVAILABLE_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;

export function HyperliquidChartWidget(props: { 
  nodeId: string;
  symbol?: string; 
  timeframe?: string;
  dispatch: (action: WorkspaceAction) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showControls, setShowControls] = useState(false);
  const viewerId = new URLSearchParams(window.location.search).get('as') ?? 'anon';
  const symbol = props.symbol ?? 'BTC';
  const timeframe = (props.timeframe ?? '1m') as typeof AVAILABLE_TIMEFRAMES[number];
  const market = useHyperliquidSeries({ symbol, viewerId });

  const updateSymbol = (newSymbol: string) => {
    props.dispatch({
      type: 'updateNodeProps',
      nodeId: props.nodeId,
      props: { symbol: newSymbol },
      now: new Date().toISOString(),
    });
  };

  const updateTimeframe = (newTimeframe: string) => {
    props.dispatch({
      type: 'updateNodeProps',
      nodeId: props.nodeId,
      props: { timeframe: newTimeframe },
      now: new Date().toISOString(),
    });
  };

  const series = useMemo(() => {
    if (market.type === 'ok') {
      // Use mid price (bid + ask) / 2
      return market.ticks.map((t) => (t.bid + t.ask) / 2);
    }
    return [];
  }, [market]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, rect.width, rect.height);

    // background
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(0, 0, rect.width, rect.height);

    const label = `Hyperliquid ${symbol} · ${props.timeframe ?? '1m'}`;

    if (market.type === 'error') {
      ctx.fillStyle = 'rgba(255,120,140,0.9)';
      ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      ctx.fillText(`${label} · ERROR: ${market.error.code}`, 10, 18);
      return;
    }

    if (series.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      ctx.fillText(`${label} · loading…`, 10, 18);
      return;
    }

    const min = Math.min(...series);
    const max = Math.max(...series);
    const pad = 8;
    const w = rect.width;
    const h = rect.height;

    // Draw price line
    ctx.strokeStyle = 'rgba(120, 190, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < series.length; i++) {
      const x = (i / (series.length - 1)) * (w - pad * 2) + pad;
      const t = (series[i] - min) / Math.max(1e-6, max - min);
      const y = (1 - t) * (h - pad * 2) + pad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();

    // Draw current price indicator
    if (market.type === 'ok' && market.last && series.length > 0) {
      const lastPrice = (market.last.bid + market.last.ask) / 2;
      const t = (lastPrice - min) / Math.max(1e-6, max - min);
      const y = (1 - t) * (h - pad * 2) + pad;

      ctx.fillStyle = 'rgba(120, 190, 255, 0.9)';
      ctx.beginPath();
      ctx.arc((series.length - 1) / (series.length - 1) * (w - pad * 2) + pad, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw bid/ask spread if available
    if (market.type === 'ok' && market.last) {
      const bid = market.last.bid;
      const ask = market.last.ask;
      const bidY = ((bid - min) / Math.max(1e-6, max - min)) * (h - pad * 2) + pad;
      const askY = ((ask - min) / Math.max(1e-6, max - min)) * (h - pad * 2) + pad;

      ctx.strokeStyle = 'rgba(120, 255, 190, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w - pad - 40, bidY);
      ctx.lineTo(w - pad, bidY);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 140, 170, 0.6)';
      ctx.beginPath();
      ctx.moveTo(w - pad - 40, askY);
      ctx.lineTo(w - pad, askY);
      ctx.stroke();
    }

    // Label with current price
    const currentPrice = series[series.length - 1];
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    ctx.fillText(`${label} · ${currentPrice.toFixed(2)}`, 10, 18);
  }, [series, market, symbol, timeframe]);

  return (
    <div 
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      
      {showControls && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            gap: 6,
            background: 'rgba(10, 14, 24, 0.95)',
            backdropFilter: 'blur(8px)',
            padding: '6px 8px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <select
            className="input"
            value={symbol}
            onChange={(e) => updateSymbol(e.target.value)}
            style={{ 
              padding: '4px 8px', 
              fontSize: 11,
              minWidth: 70,
            }}
          >
            {AVAILABLE_SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          
          <select
            className="input"
            value={timeframe}
            onChange={(e) => updateTimeframe(e.target.value)}
            style={{ 
              padding: '4px 8px', 
              fontSize: 11,
              minWidth: 50,
            }}
          >
            {AVAILABLE_TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

