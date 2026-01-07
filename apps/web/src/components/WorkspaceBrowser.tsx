import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

type WorkspaceItem = {
  workspaceId: string;
  updatedAt: string;
};

export function WorkspaceBrowser() {
  const navigate = useNavigate();
  const location = useLocation();
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWorkspaces = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams(location.search);
        const as = params.get('as');
        const url = as ? `/api/workspaces?as=${as}` : '/api/workspaces';
        
        const res = await fetch(url);
        if (!res.ok) {
          setWorkspaces([]);
          return;
        }

        const data = await res.json();
        setWorkspaces(data.workspaces || []);
      } catch (err) {
        console.error('Failed to fetch workspaces:', err);
        setWorkspaces([]);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkspaces();
  }, [location.search]);

  const handleOpen = (workspaceId: string) => {
    const params = new URLSearchParams(location.search);
    const newPath = `/w/${workspaceId}`;
    const newSearch = params.toString();
    navigate(newSearch ? `${newPath}?${newSearch}` : newPath);
  };

  return (
    <div>
      <div className="cardTitle" style={{ marginBottom: 10 }}>My Workspaces</div>
      
      {loading && (
        <div style={{ fontSize: 12, opacity: 0.6 }}>Loading...</div>
      )}

      {!loading && workspaces.length === 0 && (
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          No workspaces yet. Create one to get started.
        </div>
      )}

      {!loading && workspaces.length > 0 && (
        <div style={{ display: 'grid', gap: 6, maxHeight: 300, overflow: 'auto' }}>
          {workspaces.map((ws) => (
            <button
              key={ws.workspaceId}
              className="btn"
              onClick={() => handleOpen(ws.workspaceId)}
              style={{
                textAlign: 'left',
                padding: '8px 12px',
                fontSize: 12,
                display: 'grid',
                gap: 4,
              }}
            >
              <div className="mono" style={{ fontSize: 11, opacity: 0.9 }}>
                {ws.workspaceId.slice(0, 8)}...
              </div>
              <div style={{ fontSize: 10, opacity: 0.6 }}>
                Updated: {new Date(ws.updatedAt).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

