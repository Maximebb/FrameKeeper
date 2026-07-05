import { useState } from 'preact/hooks';
import { api } from '../api';

export function Login({
  onLoggedIn,
  onShowGuide,
}: {
  onLoggedIn: (username: string, mustChange: boolean) => void;
  onShowGuide: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: Event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.login(username, password);
      onLoggedIn(res.username, res.mustChangePassword);
    } catch {
      setError('Invalid username or password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="login-wrap">
      <form class="card login-box" onSubmit={submit}>
        <h1>
          Frame<span>Keeper</span>
        </h1>
        <label class="field">
          <span class="label">Username</span>
          <input
            type="text"
            value={username}
            onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
            autocomplete="username"
          />
        </label>
        <label class="field">
          <span class="label">Password</span>
          <input
            type="password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            autocomplete="current-password"
          />
        </label>
        {error && <div class="error-msg">{error}</div>}
        <button class="primary" style="width:100%" disabled={busy || !username || !password}>
          Sign in
        </button>
        <button type="button" class="ghost" style="width:100%;margin-top:0.75rem" onClick={onShowGuide}>
          How it works
        </button>
      </form>
    </div>
  );
}
