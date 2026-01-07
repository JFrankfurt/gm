import { useEffect, useState } from 'react';
import { getDataStore, type MarketSeriesState } from './DataStore';

// Reuse MarketSeriesState type since it matches Hyperliquid tick format
export function useHyperliquidSeries(args: { symbol: string; viewerId: string }): MarketSeriesState {
  const [state, setState] = useState<MarketSeriesState>({ type: 'idle', ticks: [] });

  useEffect(() => {
    const store = getDataStore();
    return store.subscribeHyperliquidSeries({
      symbol: args.symbol,
      viewerId: args.viewerId,
      onValue: setState,
    });
  }, [args.symbol, args.viewerId]);

  return state;
}

