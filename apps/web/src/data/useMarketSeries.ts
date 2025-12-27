import { useEffect, useState } from 'react';
import { getDataStore, type MarketSeriesState } from './DataStore';

export function useMarketSeries(args: { symbol: string; viewerId: string }): MarketSeriesState {
  const [state, setState] = useState<MarketSeriesState>({ type: 'idle', ticks: [] });

  useEffect(() => {
    const store = getDataStore();
    return store.subscribeMarketSeries({
      symbol: args.symbol,
      viewerId: args.viewerId,
      onValue: setState,
    });
  }, [args.symbol, args.viewerId]);

  return state;
}


