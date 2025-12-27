import { describe, expect, it, vi } from 'vitest';
import { setSnapshotPayloadInHash, getSnapshotPayloadFromHash } from './urlHash';

// Minimal unit test: urlHash roundtrip uses replaceState.
describe('urlHash', () => {
  it('writes and reads snapshot payload from hash', () => {
    // Minimal DOM-ish stubs for node test environment.
    type WindowStub = { location: { href: string; hash: string } };
    type HistoryStub = { replaceState: (state: unknown, title: string, url: string) => void };
    type GlobalWithDom = { window?: WindowStub; history?: HistoryStub };
    const g = globalThis as unknown as GlobalWithDom;

    const w: WindowStub = g.window ?? { location: { href: 'http://localhost/w/test', hash: '' } };
    g.window = w;

    g.history =
      g.history ??
      ({
        replaceState: (_s: unknown, _t: string, url: string) => {
          w.location.href = url;
          w.location.hash = new URL(url).hash;
        },
      } satisfies HistoryStub);

    const spy = vi.spyOn(g.history, 'replaceState');
    setSnapshotPayloadInHash('abc123');
    expect(getSnapshotPayloadFromHash()).toBe('abc123');
    expect(spy).toHaveBeenCalled();
  });
});
