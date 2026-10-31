import { useState } from 'preact/hooks';
import { formatBytes, type UploadProgress } from '../api';
import { relativeName, uploadFiles } from '../upload';

type RunState =
  | { phase: 'idle' }
  | { phase: 'running'; progress: UploadProgress }
  | { phase: 'done'; progress: UploadProgress }
  | { phase: 'failed'; error: string };

export function Upload() {
  const [files, setFiles] = useState<File[]>([]);
  const [run, setRun] = useState<RunState>({ phase: 'idle' });
  const running = run.phase === 'running';
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  const pick = (e: Event) => {
    const input = e.target as HTMLInputElement;
    setFiles(Array.from(input.files ?? []));
    setRun({ phase: 'idle' });
    input.value = '';
  };

  const start = async () => {
    const empty = { doneBytes: 0, filesDone: 0, filesSkipped: 0, currentFile: null };
    setRun({ phase: 'running', progress: empty });
    try {
      const progress = await uploadFiles(files, (p) => setRun({ phase: 'running', progress: p }));
      setRun({ phase: 'done', progress });
      setFiles([]);
    } catch (err) {
      setRun({ phase: 'failed', error: (err as Error).message });
    }
  };

  const pct =
    run.phase === 'running' && totalBytes > 0
      ? Math.min(100, Math.round((run.progress.doneBytes / totalBytes) * 100))
      : 0;

  return (
    <div class="card">
      <h2>Upload files</h2>
      <p class="muted">
        Back up files from this browser without the Windows client. Each file is hashed here,
        skipped if the server already has it, and otherwise uploaded and verified by the server.
      </p>
      <div class="row">
        <label class={`file-pick${running ? ' disabled' : ''}`}>
          Choose files
          <input type="file" multiple hidden disabled={running} onChange={pick} />
        </label>
        <label class={`file-pick${running ? ' disabled' : ''}`}>
          Choose folder
          <input type="file" hidden disabled={running} onChange={pick} {...{ webkitdirectory: true }} />
        </label>
        <button class="primary" disabled={running || files.length === 0} onClick={start}>
          Upload
        </button>
      </div>

      {files.length > 0 && (
        <p class="muted">
          {files.length} file{files.length === 1 ? '' : 's'} selected, {formatBytes(totalBytes)}
          {files.length === 1 && ` — ${relativeName(files[0])}`}
        </p>
      )}

      {run.phase === 'running' && (
        <>
          <div class="progress-track">
            <div class="progress-fill" style={`width:${pct}%`} />
          </div>
          <div class="row spread muted" style="font-size:0.88rem">
            <span>{run.progress.currentFile ?? 'starting…'}</span>
            <span>
              {run.progress.filesDone} uploaded, {run.progress.filesSkipped} already backed up
            </span>
          </div>
        </>
      )}
      {run.phase === 'done' && (
        <div class="success-msg">
          Done: {run.progress.filesDone} uploaded and verified, {run.progress.filesSkipped} already
          backed up.
        </div>
      )}
      {run.phase === 'failed' && <div class="error-msg">Upload failed: {run.error}</div>}
    </div>
  );
}
