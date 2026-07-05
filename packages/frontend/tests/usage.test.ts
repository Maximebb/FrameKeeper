import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { usageMarkdown } from '../src/usage';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const usageDocPath = path.join(repoRoot, 'docs/USAGE.md');

describe('usage guide sync', () => {
  it('bundles the same content as docs/USAGE.md', () => {
    const onDisk = readFileSync(usageDocPath, 'utf8');
    expect(usageMarkdown).toBe(onDisk);
  });

  it('covers the operator sections', () => {
    expect(usageMarkdown).toContain('# FrameKeeper — How to use');
    expect(usageMarkdown).toContain('## Day-to-day workflow');
    expect(usageMarkdown).toContain('## Backup process');
    expect(usageMarkdown).toContain('## Choosing a deployment model');
  });
});
