import { useEffect, useMemo, useRef } from 'react';
import { useMarketSeries } from '../data/useMarketSeries';

export function PriceChartWidget(props: { symbol?: string; timeframe?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerId = new URLSearchParams(window.location.search).get('as') ?? 'anon';
  const symbol = props.symbol ?? 'BTC-USD';
  const market = useMarketSeries({ symbol, viewerId });

  const series = useMemo(() => {
    if (market.type === 'ok') {
      // Use mid price.
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

    const label = `${symbol} · ${props.timeframe ?? '1m'}`;

    if (market.type === 'error') {
      ctx.fillStyle = 'rgba(255,120,140,0.9)';
      ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      ctx.fillText(`${label} · REDACTED`, 10, 18);
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

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    ctx.fillText(`${label} · ${series[series.length - 1].toFixed(2)}`, 10, 18);
  }, [series, market.type, symbol, props.timeframe]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
