import { useEffect, useState } from 'preact/hooks';
import { api, formatBytes, type Session } from '../api';

export function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [recent, setRecent] = useState<Session[]>([]);

  const refresh = () => {
    api.status().then((s) => setSession(s.session)).catch(() => undefined);
    api.sessions().then((s) => setRecent(s.sessions.slice(0, 8))).catch(() => undefined);
  };

  useEffect(() => {
    refresh();
    const source = new EventSource('/api/events');
    source.addEventListener('session', (event) => {
      const updated = JSON.parse((event as MessageEvent).data) as Session;
      setSession((current) => {
        const active = ['pending', 'confirmed', 'running'].includes(updated.status);
        if (active) return updated;
        return current?.id === updated.id ? null : current;
      });
      api.sessions().then((s) => setRecent(s.sessions.slice(0, 8))).catch(() => undefined);
    });
    source.onerror = () => {
      /* EventSource retries automatically; a 401 means the session expired */
    };
    return () => source.close();
  }, []);

  const confirm = async (id: number) => {
    await api.confirmSession(id);
    refresh();
  };
  const dismiss = async (id: number) => {
    await api.dismissSession(id);
    refresh();
  };

  const pct =
    session && session.totalBytes > 0
      ? Math.min(100, Math.round((session.doneBytes / session.totalBytes) * 100))
      : 0;

  return (
    <>
      {session?.status === 'pending' && (
        <div class="card prompt-banner">
          <div class="stack">
            <strong>
              Card "{session.cardLabel}" detected on {session.clientName}
            </strong>
            <span class="muted">
              {session.totalFiles} files, {formatBytes(session.totalBytes)} — back it up?
            </span>
          </div>
          <div class="actions">
            <button class="primary" onClick={() => confirm(session.id)}>
              Back up
            </button>
            <button class="ghost" onClick={() => dismiss(session.id)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div class="card">
        <h2>Current operation</h2>
        {!session && <div class="empty">Idle — waiting for a camera card.</div>}
        {session && (session.status === 'running' || session.status === 'confirmed') && (
          <>
            <div class="row spread">
              <span>
                Backing up <strong>{session.cardLabel}</strong> from {session.clientName}
              </span>
              <strong>{pct}%</strong>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style={`width:${pct}%`} />
            </div>
            <div class="row spread muted" style="font-size:0.88rem">
              <span>{session.currentFile ?? 'starting…'}</span>
              <span>
                {formatBytes(session.doneBytes)} / {formatBytes(session.totalBytes)} —{' '}
                {session.filesDone} copied, {session.filesSkipped} already backed up
              </span>
            </div>
          </>
        )}
        {session?.status === 'pending' && (
          <div class="empty">Waiting for confirmation above.</div>
        )}
      </div>

      <div class="card">
        <h2>Recent sessions</h2>
        {recent.length === 0 && <div class="empty">No backup sessions yet.</div>}
        {recent.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Card</th>
                <th>Client</th>
                <th>Files</th>
                <th>Size</th>
                <th>Status</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.id}>
                  <td>{s.cardLabel}</td>
                  <td>{s.clientName}</td>
                  <td>
                    {s.filesDone + s.filesSkipped}/{s.totalFiles}
                  </td>
                  <td>{formatBytes(s.totalBytes)}</td>
                  <td>
                    <span class={`badge ${s.status}`}>{s.status}</span>
                    {s.error && <span class="danger" title={s.error}> !</span>}
                  </td>
                  <td class="muted">{s.startedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
