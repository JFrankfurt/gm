export type MarketTick = {
  type: 'tick';
  symbol: string;
  ts: number;
  bid: number;
  ask: number;
  viewerId?: string;
};

export type FeedError = {
  type: 'error';
  code: string;
  symbol?: string;
  viewerId?: string;
};

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

type Listener<T> = (value: T) => void;
type StreamKey = string;

function keyForTick(symbol: string, viewerId: string): StreamKey {
  return `tick:${viewerId}:${symbol}`;
}
function keyForExec(symbol: string, viewerId: string): StreamKey {
  return `exec:${viewerId}:${symbol}`;
}

class RingBuffer<T> {
  private buf: T[] = [];
  constructor(private cap: number) {}
  push(v: T) {
    this.buf.push(v);
    if (this.buf.length > this.cap) this.buf.splice(0, this.buf.length - this.cap);
  }
  toArray(): T[] {
    return this.buf.slice();
  }
}

export type MarketSeriesState =
  | { type: 'idle'; ticks: MarketTick[] }
  | { type: 'ok'; ticks: MarketTick[]; last: MarketTick }
  | { type: 'error'; ticks: MarketTick[]; error: FeedError };

export type ExecutionsState =
  | { type: 'idle'; executions: ExecutionEvent[] }
  | { type: 'ok'; executions: ExecutionEvent[] }
  | { type: 'error'; executions: ExecutionEvent[]; error: FeedError };

export class DataStore {
  private sources = new Map<StreamKey, EventSource>();

  private marketListeners = new Map<StreamKey, Set<Listener<MarketSeriesState>>>();
  private execListeners = new Map<StreamKey, Set<Listener<ExecutionsState>>>();

  private marketBuf = new Map<StreamKey, RingBuffer<MarketTick>>();
  private marketError = new Map<StreamKey, FeedError | null>();

  private execBuf = new Map<StreamKey, RingBuffer<ExecutionEvent>>();
  private execError = new Map<StreamKey, FeedError | null>();

  subscribeMarketSeries(args: { symbol: string; viewerId: string; onValue: Listener<MarketSeriesState> }): () => void {
    const k = keyForTick(args.symbol, args.viewerId);
    if (!this.marketListeners.has(k)) this.marketListeners.set(k, new Set());
    this.marketListeners.get(k)!.add(args.onValue);

    args.onValue(this.getMarketSeriesState(args.symbol, args.viewerId));
    this.ensureMarketStream({ symbol: args.symbol, viewerId: args.viewerId });

    return () => {
      const set = this.marketListeners.get(k);
      if (!set) return;
      set.delete(args.onValue);
      if (set.size > 0) return;

      this.marketListeners.delete(k);
      this.marketBuf.delete(k);
      this.marketError.delete(k);
      this.maybeCloseSource(k);
    };
  }

  subscribeExecutions(args: { symbol: string; viewerId: string; onValue: Listener<ExecutionsState> }): () => void {
    const k = keyForExec(args.symbol, args.viewerId);
    if (!this.execListeners.has(k)) this.execListeners.set(k, new Set());
    this.execListeners.get(k)!.add(args.onValue);

    args.onValue(this.getExecutionsState(args.symbol, args.viewerId));
    this.ensureExecutionsStream({ symbol: args.symbol, viewerId: args.viewerId });

    return () => {
      const set = this.execListeners.get(k);
      if (!set) return;
      set.delete(args.onValue);
      if (set.size > 0) return;

      this.execListeners.delete(k);
      this.execBuf.delete(k);
      this.execError.delete(k);
      this.maybeCloseSource(k);
    };
  }

  // Back-compat: keep a “last message” subscription.
  subscribeMarketTick(args: { symbol: string; viewerId: string; onValue: Listener<MarketTick | FeedError> }): () => void {
    return this.subscribeMarketSeries({
      symbol: args.symbol,
      viewerId: args.viewerId,
      onValue: (s) => {
        if (s.type === 'ok') args.onValue(s.last);
        else if (s.type === 'error') args.onValue(s.error);
      },
    });
  }

  getMarketSeriesState(symbol: string, viewerId: string): MarketSeriesState {
    const k = keyForTick(symbol, viewerId);
    const ticks = (this.marketBuf.get(k) ?? new RingBuffer<MarketTick>(300)).toArray();
    const err = this.marketError.get(k) ?? null;
    if (err) return { type: 'error', ticks, error: err };
    if (ticks.length === 0) return { type: 'idle', ticks };
    return { type: 'ok', ticks, last: ticks[ticks.length - 1] };
  }

  getExecutionsState(symbol: string, viewerId: string): ExecutionsState {
    const k = keyForExec(symbol, viewerId);
    const executions = (this.execBuf.get(k) ?? new RingBuffer<ExecutionEvent>(50)).toArray();
    const err = this.execError.get(k) ?? null;
    if (err) return { type: 'error', executions, error: err };
    if (executions.length === 0) return { type: 'idle', executions };
    return { type: 'ok', executions };
  }

  private maybeCloseSource(k: StreamKey) {
    const stillMarket = this.marketListeners.get(k)?.size;
    const stillExec = this.execListeners.get(k)?.size;
    if (stillMarket || stillExec) return;
    const es = this.sources.get(k);
    if (es) {
      es.close();
      this.sources.delete(k);
    }
  }

  private ensureMarketStream(args: { symbol: string; viewerId: string }) {
    const k = keyForTick(args.symbol, args.viewerId);
    if (!this.marketBuf.has(k)) this.marketBuf.set(k, new RingBuffer<MarketTick>(300));
    if (!this.marketError.has(k)) this.marketError.set(k, null);
    if (this.sources.has(k)) return;

    const url = `/api/market/stream?symbol=${encodeURIComponent(args.symbol)}&as=${encodeURIComponent(args.viewerId)}`;
    const es = new EventSource(url);
    this.sources.set(k, es);

    const publish = () => {
      const state = this.getMarketSeriesState(args.symbol, args.viewerId);
      for (const cb of this.marketListeners.get(k) ?? []) cb(state);
    };

    es.addEventListener('tick', (evt) => {
      try {
        const parsed = JSON.parse(String((evt as MessageEvent).data)) as MarketTick;
        this.marketError.set(k, null);
        this.marketBuf.get(k)!.push(parsed);
        publish();
      } catch {
        // ignore
      }
    });

    es.addEventListener('gm_error', (evt) => {
      try {
        const parsed = JSON.parse(String((evt as MessageEvent).data)) as FeedError;
        this.marketError.set(k, parsed);
        publish();
      } catch {
        // ignore
      }
    });

    es.onerror = () => {
      this.marketError.set(k, { type: 'error', code: 'sse_disconnected', symbol: args.symbol, viewerId: args.viewerId });
      publish();
    };
  }

  private ensureExecutionsStream(args: { symbol: string; viewerId: string }) {
    const k = keyForExec(args.symbol, args.viewerId);
    if (!this.execBuf.has(k)) this.execBuf.set(k, new RingBuffer<ExecutionEvent>(50));
    if (!this.execError.has(k)) this.execError.set(k, null);
    if (this.sources.has(k)) return;

    const url = `/api/executions/stream?symbol=${encodeURIComponent(args.symbol)}&as=${encodeURIComponent(args.viewerId)}`;
    const es = new EventSource(url);
    this.sources.set(k, es);

    const publish = () => {
      const state = this.getExecutionsState(args.symbol, args.viewerId);
      for (const cb of this.execListeners.get(k) ?? []) cb(state);
    };

    es.addEventListener('execution', (evt) => {
      try {
        const parsed = JSON.parse(String((evt as MessageEvent).data)) as ExecutionEvent;
        this.execError.set(k, null);
        this.execBuf.get(k)!.push(parsed);
        publish();
      } catch {
        // ignore
      }
    });

    es.addEventListener('gm_error', (evt) => {
      try {
        const parsed = JSON.parse(String((evt as MessageEvent).data)) as FeedError;
        this.execError.set(k, parsed);
        publish();
      } catch {
        // ignore
      }
    });

    es.onerror = () => {
      this.execError.set(k, { type: 'error', code: 'sse_disconnected', symbol: args.symbol, viewerId: args.viewerId });
      publish();
    };
  }
}

let singleton: DataStore | null = null;
export function getDataStore(): DataStore {
  if (!singleton) singleton = new DataStore();
  return singleton;
}
