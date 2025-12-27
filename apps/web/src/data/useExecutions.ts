import { useEffect, useState } from 'react';
import { getDataStore, type ExecutionsState } from './DataStore';

export function useExecutions(args: { symbol: string; viewerId: string }): ExecutionsState {
  const [state, setState] = useState<ExecutionsState>({ type: 'idle', executions: [] });

  useEffect(() => {
    const store = getDataStore();
    return store.subscribeExecutions({
      symbol: args.symbol,
      viewerId: args.viewerId,
      onValue: setState,
    });
  }, [args.symbol, args.viewerId]);

  return state;
}


