export function readHashParams(): URLSearchParams {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(raw);
}

export function writeHashParams(params: URLSearchParams) {
  const nextHash = params.toString();
  const u = new URL(window.location.href);
  u.hash = nextHash;
  // Replace (do not push) so this stays a continuous “current URL” representation.
  history.replaceState(null, '', u.toString());
}

export function getSnapshotPayloadFromHash(): string | null {
  const p = readHashParams();
  return p.get('s');
}

export function setSnapshotPayloadInHash(payload: string) {
  const p = readHashParams();
  p.set('s', payload);
  writeHashParams(p);
}
