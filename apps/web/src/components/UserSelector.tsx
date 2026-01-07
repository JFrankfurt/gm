import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const DEMO_USERS = [
  { id: 'anon', label: 'Anonymous' },
  { id: 'userA', label: 'User A' },
  { id: 'userB', label: 'User B' },
  { id: 'alice', label: 'Alice' },
  { id: 'bob', label: 'Bob' },
] as const;

export function UserSelector() {
  const navigate = useNavigate();
  const location = useLocation();

  const currentUser = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('as') ?? 'anon';
  }, [location.search]);

  const handleChange = (newUser: string) => {
    const params = new URLSearchParams(location.search);
    
    if (newUser === 'anon') {
      params.delete('as');
    } else {
      params.set('as', newUser);
    }

    const newSearch = params.toString();
    navigate({
      pathname: location.pathname,
      search: newSearch ? `?${newSearch}` : '',
    }, { replace: true });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 12, opacity: 0.75 }}>Demo User:</div>
      <select
        className="input"
        value={currentUser}
        onChange={(e) => handleChange(e.target.value)}
        style={{
          padding: '4px 10px',
          fontSize: 12,
          minWidth: 100,
        }}
      >
        {DEMO_USERS.map((user) => (
          <option key={user.id} value={user.id}>
            {user.label}
          </option>
        ))}
      </select>
    </div>
  );
}

