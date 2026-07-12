import { useEffect, useState } from 'preact/hooks';
import { api, formatBytes, type BackedUpFile } from '../api';

export function History() {
  const [search, setSearch] = useState('');
  const [files, setFiles] = useState<BackedUpFile[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handle = setTimeout(() => {
      api
        .files(search, offset)
        .then((res) => {
          setFiles(res.items);
          setTotal(res.total);
        })
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(handle);
  }, [search, offset]);

  return (
    <div class="card">
      <div class="row spread" style="margin-bottom:0.9rem">
        <h2 style="margin:0">Backed up files</h2>
        <span class="muted">{total} total</span>
      </div>
      <input
        type="search"
        placeholder="Search by file name or digest…"
        value={search}
        onInput={(e) => {
          setOffset(0);
          setSearch((e.target as HTMLInputElement).value);
        }}
      />
      {files.length === 0 && <div class="empty">No files found.</div>}
      {files.length > 0 && (
        <table style="margin-top:0.8rem">
          <thead>
            <tr>
              <th>Name</th>
              <th>Size</th>
              <th>SHA-256</th>
              <th>Backed up</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id}>
                <td title={f.sha256}>{f.originalName}</td>
                <td>{formatBytes(f.size)}</td>
                <td class="mono" title={f.sha256}>
                  {f.sha256.slice(0, 16)}…
                </td>
                <td class="muted">{f.backedUpAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div class="row" style="margin-top:0.9rem">
        <button class="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>
          Previous
        </button>
        <button class="ghost" disabled={offset + 50 >= total} onClick={() => setOffset(offset + 50)}>
          Next
        </button>
      </div>
    </div>
  );
}
