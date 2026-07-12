import { useState } from 'preact/hooks';
import { api } from '../api';

export function ChangePassword({ forced, onDone }: { forced?: boolean; onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: Event) => {
    event.preventDefault();
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.changePassword(current, next);
      onDone();
    } catch (err) {
      const code = (err as Error).message;
      setError(
        code === 'password_too_short'
          ? 'New password must be at least 8 characters.'
          : code === 'password_too_weak'
            ? 'Pick a stronger password.'
            : 'Current password is incorrect.'
      );
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <form class={forced ? 'card login-box' : ''} onSubmit={submit}>
      {forced && (
        <>
          <h1>
            Frame<span>Keeper</span>
          </h1>
          <p class="muted">You are using the default password. Set a new one to continue.</p>
        </>
      )}
      <label class="field">
        <span class="label">Current password</span>
        <input
          type="password"
          value={current}
          onInput={(e) => setCurrent((e.target as HTMLInputElement).value)}
          autocomplete="current-password"
        />
      </label>
      <label class="field">
        <span class="label">New password (min. 8 characters)</span>
        <input
          type="password"
          value={next}
          onInput={(e) => setNext((e.target as HTMLInputElement).value)}
          autocomplete="new-password"
        />
      </label>
      <label class="field">
        <span class="label">Confirm new password</span>
        <input
          type="password"
          value={confirm}
          onInput={(e) => setConfirm((e.target as HTMLInputElement).value)}
          autocomplete="new-password"
        />
      </label>
      {error && <div class="error-msg">{error}</div>}
      <button class="primary" style={forced ? 'width:100%' : ''} disabled={busy || !current || !next || !confirm}>
        Change password
      </button>
    </form>
  );

  return forced ? <div class="login-wrap">{form}</div> : form;
}
