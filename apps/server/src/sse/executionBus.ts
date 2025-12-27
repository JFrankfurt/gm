export type ExecutionEvent = {
  type: 'execution';
  symbol: string;
  viewerId: string;
  ts: number;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  orderId: string;
};

type Key = string;
type Sink = (evt: ExecutionEvent) => void;

function key(viewerId: string, symbol: string): Key {
  return `${viewerId}:${symbol}`;
}

const sinksByKey = new Map<Key, Set<Sink>>();

export function subscribeExecutions(args: { viewerId: string; symbol: string; onEvent: Sink }): () => void {
  const k = key(args.viewerId, args.symbol);
  if (!sinksByKey.has(k)) sinksByKey.set(k, new Set());
  sinksByKey.get(k)!.add(args.onEvent);
  return () => {
    const set = sinksByKey.get(k);
    if (!set) return;
    set.delete(args.onEvent);
    if (set.size === 0) sinksByKey.delete(k);
  };
}

export function publishExecution(evt: ExecutionEvent) {
  const k = key(evt.viewerId, evt.symbol);
  const set = sinksByKey.get(k);
  if (!set) return;
  for (const s of set) s(evt);
}


