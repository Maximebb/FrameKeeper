import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from './api';
import { Login } from './views/Login';
import { ChangePassword } from './views/ChangePassword';
import { Dashboard } from './views/Dashboard';
import { History } from './views/History';
import { Settings } from './views/Settings';
import { Guide } from './views/Guide';

type AuthState =
  | { phase: 'loading' }
  | { phase: 'anonymous' }
  | { phase: 'must-change'; username: string }
  | { phase: 'ready'; username: string };

type Tab = 'dashboard' | 'history' | 'settings' | 'guide';

export function App() {
  const [auth, setAuth] = useState<AuthState>({ phase: 'loading' });
  const [tab, setTab] = useState<Tab>('dashboard');
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((me) =>
        setAuth(
          me.mustChangePassword
            ? { phase: 'must-change', username: me.username }
            : { phase: 'ready', username: me.username }
        )
      )
      .catch(() => setAuth({ phase: 'anonymous' }));
  }, []);

  const onLoggedIn = (username: string, mustChange: boolean) =>
    setAuth(mustChange ? { phase: 'must-change', username } : { phase: 'ready', username });

  const onLogout = async () => {
    await api.logout().catch(() => undefined);
    setAuth({ phase: 'anonymous' });
  };

  // Session may expire while browsing; bounce back to login on any 401.
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      if (event.reason instanceof ApiError && event.reason.status === 401) {
        setAuth({ phase: 'anonymous' });
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  if (showGuide) return <Guide onBack={() => setShowGuide(false)} />;

  if (auth.phase === 'loading') return <div class="login-wrap muted">Loading…</div>;
  if (auth.phase === 'anonymous')
    return <Login onLoggedIn={onLoggedIn} onShowGuide={() => setShowGuide(true)} />;
  if (auth.phase === 'must-change')
    return <ChangePassword forced onDone={() => setAuth({ phase: 'ready', username: auth.username })} />;

  return (
    <>
      <header class="topbar">
        <div class="brand">
          Frame<span>Keeper</span>
        </div>
        <nav>
          <button class={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
            Dashboard
          </button>
          <button class={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            History
          </button>
          <button class={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
            Settings
          </button>
          <button class={tab === 'guide' ? 'active' : ''} onClick={() => setTab('guide')}>
            Guide
          </button>
        </nav>
        <div class="row">
          <span class="muted">{auth.username}</span>
          <button class="ghost" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>
      <main>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'history' && <History />}
        {tab === 'settings' && <Settings />}
        {tab === 'guide' && <Guide />}
      </main>
    </>
  );
}
