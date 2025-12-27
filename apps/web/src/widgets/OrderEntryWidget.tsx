import { useMemo, useState } from 'react';
import { useExecutions } from '../data/useExecutions';

export function OrderEntryWidget(props: { symbol?: string }) {
  const [symbol, setSymbol] = useState(props.symbol ?? 'ETH-USD');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [last, setLast] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const viewerId = useMemo(() => new URLSearchParams(window.location.search).get('as') ?? 'anon', []);
  const execState = useExecutions({ symbol, viewerId });
  const redacted = execState.type === 'error' ? execState.error : null;

  return (
    <div style={{ padding: 10, display: 'grid', gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Order Entry</div>

      <label style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Symbol</div>
        <input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn"
          onClick={() => setSide('buy')}
          style={{ flex: 1, background: side === 'buy' ? 'rgba(70, 200, 140, 0.25)' : undefined }}
        >
          Buy
        </button>
        <button
          className="btn"
          onClick={() => setSide('sell')}
          style={{ flex: 1, background: side === 'sell' ? 'rgba(255, 80, 120, 0.22)' : undefined }}
        >
          Sell
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Qty</div>
          <input className="input" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Limit price</div>
          <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="(market)" />
        </label>
      </div>

      <button
        className="btn"
        onClick={async () => {
          setSubmitErr(null);
          const summary = `${side.toUpperCase()} ${qty} ${symbol} ${price ? `@ ${price}` : '@ MKT'}`;
          setLast(summary);

          const qtyNum = Number(qty);
          const priceNum = price ? Number(price) : undefined;
          if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
            setSubmitErr('Invalid qty');
            return;
          }
          if (price && (!Number.isFinite(priceNum) || (priceNum ?? 0) <= 0)) {
            setSubmitErr('Invalid price');
            return;
          }

          try {
            const q = new URLSearchParams();
            if (viewerId) q.set('as', viewerId);
            const res = await fetch(`/api/orders${q.toString() ? `?${q.toString()}` : ''}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                symbol,
                side,
                qty: qtyNum,
                ...(priceNum ? { price: priceNum } : {}),
              }),
            });
            if (res.status === 403) {
              setSubmitErr('Permission denied');
              return;
            }
            if (!res.ok) {
              setSubmitErr(`Failed (${res.status})`);
              return;
            }
          } catch (e) {
            setSubmitErr(e instanceof Error ? e.message : 'Failed to submit');
          }
        }}
        style={{ fontWeight: 700 }}
      >
        Submit (mock)
      </button>

      {(submitErr || redacted) && (
        <div className="mono" style={{ color: 'rgba(255,120,140,0.95)', fontSize: 12 }}>
          {submitErr ?? `Redacted: ${redacted?.code ?? 'forbidden'}`}
        </div>
      )}

      {last && (
        <div className="mono" style={{ opacity: 0.85 }}>
          Last: {last}
        </div>
      )}

      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Executions</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {execState.executions.slice(-5).reverse().map((e) => (
            <div
              key={e.orderId}
              className="mono"
              style={{
                fontSize: 12,
                opacity: 0.9,
                padding: '6px 8px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              {new Date(e.ts).toLocaleTimeString()} {e.side.toUpperCase()} {e.qty} @ {e.price.toFixed(2)}
            </div>
          ))}
          {execState.executions.length === 0 && (
            <div className="mono" style={{ fontSize: 12, opacity: 0.6 }}>
              —
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
