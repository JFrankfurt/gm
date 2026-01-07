import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCreateWorkspace } from '../api/workspaces';
import { UserSelector } from '../components/UserSelector';
import { WorkspaceBrowser } from '../components/WorkspaceBrowser';

export function HomePage() {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [existingId, setExistingId] = useState('');

  const example = useMemo(() => crypto.randomUUID(), []);

  async function onCreate() {
    try {
      setIsCreating(true);
      const created = await apiCreateWorkspace();
      navigate(`/w/${created.workspaceId}`);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: 680, maxWidth: '92vw' }}>
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>GM Workspace</div>
        <div style={{ opacity: 0.75, marginBottom: 18 }}>
          Proof-of-concept Figma-like canvas workspace for a crypto trading dashboard.
        </div>

        <div style={{ marginBottom: 24 }}>
          <UserSelector />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
          <button className="btn" onClick={onCreate} disabled={isCreating}>
            {isCreating ? 'Creating…' : 'Create new workspace'}
          </button>
          <div style={{ opacity: 0.7 }}>or open an existing workspace id</div>
        </div>

        <div className="field">
          <div style={{ fontSize: 12, opacity: 0.7 }}>Open workspace</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              value={existingId}
              placeholder={example}
              onChange={(e) => setExistingId(e.target.value)}
            />
            <button className="btn" onClick={() => navigate(`/w/${existingId}`)} disabled={!existingId.trim()}>
              Open
            </button>
          </div>
          <div className="mono" style={{ marginTop: 10 }}>
            Shareable URL format: <span style={{ opacity: 0.9 }}>/w/&lt;workspaceId&gt;</span>
          </div>
        </div>

        <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <WorkspaceBrowser />
        </div>
      </div>
    </div>
  );
}
