import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listCameraCards, mapDrivesToCards, scanCard, type DetectedDrive } from '../src/drives';

function makeCard(withDcim = true): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-card-'));
  if (withDcim) fs.mkdirSync(path.join(root, 'DCIM', '100CANON'), { recursive: true });
  return root;
}

afterEach(() => {
  delete process.env.FK_WATCH_DIRS;
});

describe('scanCard', () => {
  it('lists files under DCIM recursively with forward-slash relative paths', () => {
    const root = makeCard();
    fs.writeFileSync(path.join(root, 'DCIM', '100CANON', 'IMG_0001.CR3'), 'abc');
    fs.mkdirSync(path.join(root, 'DCIM', '101CANON'));
    fs.writeFileSync(path.join(root, 'DCIM', '101CANON', 'MVI_0001.MP4'), 'defgh');
    // Files outside DCIM must be ignored (camera system files, etc.)
    fs.writeFileSync(path.join(root, 'autorun.inf'), 'nope');

    const files = scanCard(root);
    expect(files.map((f) => f.relPath).sort()).toEqual([
      'DCIM/100CANON/IMG_0001.CR3',
      'DCIM/101CANON/MVI_0001.MP4',
    ]);
    const img = files.find((f) => f.relPath.endsWith('.CR3'))!;
    expect(img.size).toBe(3);
    expect(img.absPath).toBe(path.join(root, 'DCIM', '100CANON', 'IMG_0001.CR3'));
    expect(img.mtimeMs).toBeGreaterThan(0);
  });

  it('returns an empty list for an empty DCIM', () => {
    expect(scanCard(makeCard())).toEqual([]);
  });
});

describe('mapDrivesToCards', () => {
  const drive = (overrides: Partial<DetectedDrive>): DetectedDrive => ({
    isRemovable: true,
    isSystem: false,
    description: 'SD Card Reader',
    mountpoints: [{ path: 'E:\\', label: 'CANON_SD' }],
    ...overrides,
  });

  it('maps removable non-system drives to cards', () => {
    expect(mapDrivesToCards([drive({})])).toEqual([{ root: 'E:\\', label: 'CANON_SD' }]);
  });

  it('excludes system and non-removable drives', () => {
    expect(
      mapDrivesToCards([
        drive({ isSystem: true }),
        drive({ isRemovable: false }),
        drive({ isRemovable: false, isSystem: true }),
      ])
    ).toEqual([]);
  });

  it('skips drives without mountpoints (e.g. card reader with no card)', () => {
    expect(mapDrivesToCards([drive({ mountpoints: [] })])).toEqual([]);
  });

  it('emits one card per mountpoint', () => {
    const cards = mapDrivesToCards([
      drive({
        mountpoints: [
          { path: 'E:\\', label: 'CARD_A' },
          { path: 'F:\\', label: 'CARD_B' },
        ],
      }),
    ]);
    expect(cards.map((c) => c.root)).toEqual(['E:\\', 'F:\\']);
  });

  it('falls back label -> description -> trimmed path', () => {
    expect(
      mapDrivesToCards([drive({ mountpoints: [{ path: 'E:\\', label: null }] })])[0].label
    ).toBe('SD Card Reader');
    expect(
      mapDrivesToCards([
        drive({ description: '  ', mountpoints: [{ path: 'E:\\', label: '' }] }),
      ])[0].label
    ).toBe('E:');
  });
});

// The Windows branch enumerates volumes via drivelist and needs real hardware;
// the FK_WATCH_DIRS branch is what dev/CI (Linux) exercises.
describe.skipIf(process.platform === 'win32')('listCameraCards via FK_WATCH_DIRS', () => {
  it('only reports directories that contain DCIM', async () => {
    const camera = makeCard(true);
    const usbStick = makeCard(false);
    process.env.FK_WATCH_DIRS = [camera, usbStick, '/does/not/exist'].join(';');

    const cards = await listCameraCards();
    expect(cards.map((c) => c.root)).toEqual([camera]);
    expect(cards[0].label).toBe(path.basename(camera));
  });

  it('reports nothing when unset', async () => {
    expect(await listCameraCards()).toEqual([]);
  });
});
