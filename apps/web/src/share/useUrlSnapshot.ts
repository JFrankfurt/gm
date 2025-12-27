import { useEffect, useRef } from 'react';
import { type WorkspaceDoc } from '@gm/shared';
import { encodeDocToSnapshotPayload } from './snapshotUrl';
import { setSnapshotPayloadInHash } from './urlHash';

export function useUrlSnapshot(args: {
  doc: WorkspaceDoc | null;
  enabled: boolean;
  debounceMs?: number;
  maxPayloadChars?: number;
}) {
  const debounceMs = args.debounceMs ?? 900;
  const maxPayloadChars = args.maxPayloadChars ?? 120_000;

  const lastKeyRef = useRef<string>('');
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!args.enabled) return;
    if (!args.doc) return;

    // Snapshot should ignore selection (UI-only) and should change when viewport/layout changes.
    // Using updatedAt+viewport captures most meaningful changes while staying cheap.
    const key = `${args.doc.updatedAt}|${args.doc.viewport.centerX}|${args.doc.viewport.centerY}|${args.doc.viewport.zoom}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(async () => {
      try {
        const payload = await encodeDocToSnapshotPayload(args.doc!);
        if (payload.length > maxPayloadChars) return; // guardrail for PoC
        setSnapshotPayloadInHash(payload);
      } catch {
        // ignore
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [args.enabled, args.doc, debounceMs, maxPayloadChars]);
}
