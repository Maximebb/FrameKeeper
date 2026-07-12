import { useEffect, useState } from 'preact/hooks';
import { api, type ServerConfig, type TokenInfo } from '../api';
import { ChangePassword } from './ChangePassword';

export function Settings() {
  return (
    <>
      <ServerConfigCard />
      <TokensCard />
      <div class="card">
        <h2>Change password</h2>
        <ChangePassword onDone={() => undefined} />
      </div>
    </>
  );
}

function ServerConfigCard() {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [patterns, setPatterns] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getConfig().then((c) => {
      setConfig(c);
      setPatterns(c.ignorePatterns.join(', '));
    });
  }, []);

  if (!config) return <div class="card muted">Loading configuration…</div>;

  const save = async () => {
    const next = await api.putConfig({
      ...config,
      ignorePatterns: patterns
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
    });
    setConfig(next);
    setPatterns(next.ignorePatterns.join(', '));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div class="card">
      <h2>Server configuration</h2>
      <label class="toggle">
        <input
          type="checkbox"
          checked={config.autoConfirm}
          onChange={(e) =>
            setConfig({ ...config, autoConfirm: (e.target as HTMLInputElement).checked })
          }
        />
        <span class="stack">
          <span>Start backups automatically</span>
          <span class="muted" style="font-size:0.85rem">
            Skip the confirmation prompt when a card is detected.
          </span>
        </span>
      </label>
      <label class="field">
        <span class="label">Ignored file patterns (comma-separated, e.g. *.THM, *.LRV)</span>
        <input
          type="text"
          value={patterns}
          onInput={(e) => setPatterns((e.target as HTMLInputElement).value)}
        />
      </label>
      <div class="row">
        <button class="primary" onClick={save}>
          Save
        </button>
        {saved && <span class="success-msg">Saved.</span>}
      </div>
      <h3>Storage</h3>
      <p class="muted" style="font-size:0.88rem; margin:0">
        Backup folder and listen port are set through container environment variables
        (FK_BACKUP_DIR, FK_DATA_DIR, PORT) — see the server deployment configuration.
      </p>
    </div>
  );
}

function TokensCard() {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [name, setName] = useState('');
  const [freshToken, setFreshToken] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = () => api.listTokens().then((r) => setTokens(r.tokens));
  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    const res = await api.createToken(name);
    setFreshToken({ name: res.name, token: res.token });
    setName('');
    setCopied(false);
    refresh();
  };

  const revoke = async (tokenId: string) => {
    await api.revokeToken(tokenId);
    refresh();
  };

  const copy = async () => {
    if (freshToken) {
      await navigator.clipboard.writeText(freshToken.token);
      setCopied(true);
    }
  };

  return (
    <div class="card">
      <h2>API tokens</h2>
      <p class="muted" style="font-size:0.88rem">
        Clients authenticate with an API token set in their local config.yaml. A token is shown
        only once, right after you create it.
      </p>
      <div class="row">
        <input
          type="text"
          placeholder='Token name, e.g. "living-room-pc"'
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
        <button class="primary" disabled={!name.trim()} onClick={create}>
          Create
        </button>
      </div>

      {freshToken && (
        <div>
          <div class="token-reveal">{freshToken.token}</div>
          <div class="row">
            <button class="ghost" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <span class="warn" style="font-size:0.85rem">
              Save this now — it cannot be shown again.
            </span>
          </div>
        </div>
      )}

      {tokens.length > 0 && (
        <table style="margin-top:1rem">
          <thead>
            <tr>
              <th>Name</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.token_id}>
                <td>{t.name}</td>
                <td class="muted">{t.created_at}</td>
                <td class="muted">{t.last_used_at ?? 'never'}</td>
                <td>{t.revoked_at ? <span class="danger">revoked</span> : <span class="ok">active</span>}</td>
                <td>
                  {!t.revoked_at && (
                    <button class="danger-btn" onClick={() => revoke(t.token_id)}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
