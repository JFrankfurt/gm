import { useMemo } from "react";
import { useMarketSeries } from "../data/useMarketSeries";

type Row = { symbol: string; bid: number; ask: number };

export function MarketWatchWidget() {
  const base = useMemo<Row[]>(
    () => [
      { symbol: "BTC-USD", bid: 100_000, ask: 100_010 },
      { symbol: "ETH-USD", bid: 3_800, ask: 3_803 },
      { symbol: "SOL-USD", bid: 210, ask: 210.4 },
      { symbol: "DOGE-USD", bid: 0.42, ask: 0.421 },
      { symbol: "ARB-USD", bid: 1.23, ask: 1.234 },
    ],
    []
  );

  const viewerId =
    new URLSearchParams(window.location.search).get("as") ?? "anon";
  const market = useMarketSeries({ symbol: "BTC-USD", viewerId });
  const tick = market.type === "ok" ? market.last : null;
  const redacted = market.type === "error" ? market.error : null;

  const rows = useMemo(() => {
    if (!tick) return base;
    if (base.length === 0) return base;
    if (base[0].symbol !== tick.symbol) return base;
    const next = base.slice();
    next[0] = { ...next[0], bid: tick.bid, ask: tick.ask };
    return next;
  }, [base, tick]);

  return (
    <div style={{ padding: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Market Watch</div>
      {redacted && (
        <div
          style={{
            border: "1px dashed rgba(255,255,255,0.25)",
            borderRadius: 10,
            padding: 10,
            background: "rgba(255,255,255,0.03)",
            marginBottom: 10,
            fontSize: 12,
            opacity: 0.9,
          }}
        >
          Data is redacted for this viewer. Try{" "}
          <span className="mono">?as=userA</span> for BTC-USD access.
        </div>
      )}
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((r) => (
          <div
            key={r.symbol}
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr 1fr",
              gap: 10,
              alignItems: "center",
              padding: "6px 8px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontWeight: 700 }}>{r.symbol}</div>
            <div className="mono" style={{ color: "rgba(120, 255, 190, 0.9)" }}>
              {r.bid.toFixed(r.bid < 2 ? 4 : 2)}
            </div>
            <div className="mono" style={{ color: "rgba(255, 140, 170, 0.9)" }}>
              {r.ask.toFixed(r.ask < 2 ? 4 : 2)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
