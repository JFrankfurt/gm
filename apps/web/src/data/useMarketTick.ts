import { useEffect, useState } from 'react';
import { getDataStore, type FeedError, type MarketTick } from './DataStore';

export function useMarketTick(args: {
  symbol: string;
  viewerId: string;
}): { last: MarketTick | FeedError | null } {
  const [last, setLast] = useState<MarketTick | FeedError | null>(null);

  useEffect(() => {
    const store = getDataStore();
    return store.subscribeMarketTick({
      symbol: args.symbol,
      viewerId: args.viewerId,
      onValue: setLast,
    });
  }, [args.symbol, args.viewerId]);

  return { last };
}
