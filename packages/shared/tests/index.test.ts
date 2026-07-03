import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { matchesAnyPattern, sha256File } from '../src';

describe('sha256File', () => {
  it('computes the digest of a file on disk', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-shared-'));
    const file = path.join(dir, 'hello.txt');
    fs.writeFileSync(file, 'hello');
    expect(await sha256File(file)).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('matches crypto for binary content', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-shared-'));
    const file = path.join(dir, 'blob.bin');
    const content = Buffer.alloc(1024 * 1024, 7);
    fs.writeFileSync(file, content);
    const expected = createHash('sha256').update(content).digest('hex');
    expect(await sha256File(file)).toBe(expected);
  });

  it('rejects for a missing file', async () => {
    await expect(sha256File('/does/not/exist')).rejects.toThrow();
  });
});

describe('matchesAnyPattern', () => {
  it('matches extensions case-insensitively', () => {
    expect(matchesAnyPattern('IMG_0001.THM', ['*.thm'])).toBe(true);
    expect(matchesAnyPattern('img_0001.thm', ['*.THM'])).toBe(true);
    expect(matchesAnyPattern('IMG_0001.JPG', ['*.thm'])).toBe(false);
  });

  it('returns false with no patterns', () => {
    expect(matchesAnyPattern('anything.jpg', [])).toBe(false);
  });

  it('supports wildcards anywhere in the pattern', () => {
    expect(matchesAnyPattern('MVI_1234.MP4', ['mvi_*.mp4'])).toBe(true);
    expect(matchesAnyPattern('DCIM/100/CLIP.MP4', ['*clip*'])).toBe(true);
    expect(matchesAnyPattern('CLIP.MOV', ['mvi_*.mp4'])).toBe(false);
  });

  it('requires a full match, not a substring', () => {
    expect(matchesAnyPattern('file.thm.jpg', ['*.thm'])).toBe(false);
  });

  it('escapes regex special characters in patterns', () => {
    expect(matchesAnyPattern('a+b(1).txt', ['a+b(1).txt'])).toBe(true);
    expect(matchesAnyPattern('aXb1.txt', ['a+b(1).txt'])).toBe(false);
  });
});
