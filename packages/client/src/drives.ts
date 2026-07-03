import fs from 'node:fs';
import path from 'node:path';

export interface CameraCard {
  /** Volume root, e.g. "E:\\" */
  root: string;
  label: string;
}

/** The subset of drivelist's Drive we rely on (kept local so tests don't need the native module). */
export interface DetectedDrive {
  isRemovable: boolean;
  isSystem: boolean;
  description?: string | null;
  mountpoints: { path: string; label?: string | null }[];
}

/** Pure mapping from drivelist output to candidate cards (one per mountpoint). */
export function mapDrivesToCards(drives: DetectedDrive[]): CameraCard[] {
  return drives
    .filter((drive) => drive.isRemovable && !drive.isSystem)
    .flatMap((drive) =>
      drive.mountpoints.map((mount) => ({
        root: mount.path,
        label:
          mount.label?.trim() ||
          drive.description?.trim() ||
          mount.path.replace(/[\\/]+$/, ''),
      }))
    );
}

/**
 * Lists removable volumes that look like camera cards (contain a DCIM folder).
 * On Windows this uses drivelist, which calls the Win32 device APIs directly.
 * On other platforms it honors FK_WATCH_DIRS (";"-separated paths) to support
 * development, CI and the smoke test.
 */
export async function listCameraCards(): Promise<CameraCard[]> {
  const roots =
    process.platform === 'win32' ? await listRemovableRootsWindows() : listWatchDirRoots();
  return roots.filter((card) => {
    try {
      return fs.statSync(path.join(card.root, 'DCIM')).isDirectory();
    } catch {
      return false;
    }
  });
}

async function listRemovableRootsWindows(): Promise<CameraCard[]> {
  try {
    // Imported lazily so the native module only loads on the Windows path.
    const { list } = await import('drivelist');
    return mapDrivesToCards((await list()) as DetectedDrive[]);
  } catch (err) {
    console.error('drivelist enumeration failed:', (err as Error).message);
    return [];
  }
}

function listWatchDirRoots(): CameraCard[] {
  const dirs = (process.env.FK_WATCH_DIRS ?? '').split(';').filter(Boolean);
  return dirs
    .filter((d) => fs.existsSync(d))
    .map((d) => ({ root: d, label: path.basename(d) || d }));
}

export interface CardFile {
  /** Relative to card root, forward slashes. */
  relPath: string;
  absPath: string;
  size: number;
  mtimeMs: number;
}

/** Recursively lists files under the card's DCIM folder. */
export function scanCard(root: string): CardFile[] {
  const files: CardFile[] = [];
  const dcim = path.join(root, 'DCIM');
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        const stat = fs.statSync(abs);
        files.push({
          relPath: path.relative(root, abs).split(path.sep).join('/'),
          absPath: abs,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        });
      }
    }
  };
  walk(dcim);
  return files;
}
