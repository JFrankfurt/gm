import { describe, expect, it, vi } from 'vitest';
import { DataStore } from './DataStore';

class FakeEventSource {
  url: string;
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  private handlers = new Map<string, Array<(evt: MessageEvent) => void>>();
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(type: string, cb: (evt: MessageEvent) => void) {
    const arr = this.handlers.get(type) ?? [];
    arr.push(cb);
    this.handlers.set(type, arr);
  }
  close() {}
  emit(type: string, data: unknown) {
    const evt = { data: JSON.stringify(data) } as MessageEvent;
    for (const cb of this.handlers.get(type) ?? []) cb(evt);
  }
}

describe('DataStore', () => {
  it('buffers market ticks and exposes a series', () => {
    const g = globalThis as unknown as { EventSource: typeof FakeEventSource };
    g.EventSource = FakeEventSource;

    const store = new DataStore();
    const seen: number[] = [];

    const unsub = store.subscribeMarketSeries({
      symbol: 'BTC-USD',
      viewerId: 'userA',
      onValue: (s) => {
        if (s.type === 'ok') seen.push(s.ticks.length);
      },
    });

    // Pull the created FakeEventSource instance from the store indirectly by creating another subscription.
    // We know the URL format; just find it via a new EventSource constructor spy.
    const sources = (store as unknown as { sources: Map<string, FakeEventSource> }).sources;
    const es = sources.get('tick:userA:BTC-USD');
    expect(es).toBeTruthy();

    es!.emit('tick', { type: 'tick', symbol: 'BTC-USD', ts: 1, bid: 1, ask: 2, viewerId: 'userA' });
    es!.emit('tick', { type: 'tick', symbol: 'BTC-USD', ts: 2, bid: 2, ask: 3, viewerId: 'userA' });
    es!.emit('tick', { type: 'tick', symbol: 'BTC-USD', ts: 3, bid: 3, ask: 4, viewerId: 'userA' });

    expect(seen.at(-1)).toBe(3);
    unsub();
  });

  it('propagates gm_error as error state', () => {
    const g = globalThis as unknown as { EventSource: typeof FakeEventSource };
    g.EventSource = FakeEventSource;

    const store = new DataStore();
    const spy = vi.fn();

    store.subscribeMarketSeries({
      symbol: 'BTC-USD',
      viewerId: 'anon',
      onValue: spy,
    });

    const sources = (store as unknown as { sources: Map<string, FakeEventSource> }).sources;
    const es = sources.get('tick:anon:BTC-USD');
    es!.emit('gm_error', { type: 'error', code: 'forbidden', symbol: 'BTC-USD', viewerId: 'anon' });

    const last = spy.mock.calls.at(-1)?.[0];
    expect(last.type).toBe('error');
  });
});


