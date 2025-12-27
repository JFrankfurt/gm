import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { type WorkspaceDoc } from '@gm/shared';
import { decodeDocFromSnapshotPayload } from '../share/snapshotUrl';

type State =
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | { type: 'ready'; doc: WorkspaceDoc };

export function SnapshotPage() {
  const { payload } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ type: 'loading' });

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await decodeDocFromSnapshotPayload(payload);
        if (cancelled) return;
        setState({ type: 'ready', doc });
      } catch (e) {
        if (cancelled) return;
        setState({ type: 'error', message: e instanceof Error ? e.message : 'failed to decode snapshot' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [payload]);

  if (!payload) return <div style={{ padding: 16 }}>Error: missing payload</div>;
  if (state.type === 'loading') return <div style={{ padding: 16 }}>Loading snapshot…</div>;
  if (state.type === 'error') return <div style={{ padding: 16 }}>Error: {state.message}</div>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Snapshot loaded</div>
      <div className="mono" style={{ marginBottom: 12 }}>
        workspaceId={state.doc.workspaceId} nodes={state.doc.nodeOrder.length}
      </div>
      <button className="btn" onClick={() => navigate(`/w/${state.doc.workspaceId}`)}>
        Open server-backed workspace id
      </button>
      <div className="mono" style={{ marginTop: 10, opacity: 0.75 }}>
        This route is a self-contained snapshot; next step will render the snapshot directly without requiring server state.
      </div>
    </div>
  );
}
