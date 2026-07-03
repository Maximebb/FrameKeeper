import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config';

const written: string[] = [];

function writeConfig(yaml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-config-'));
  const file = path.join(dir, 'config.yaml');
  fs.writeFileSync(file, yaml);
  written.push(file);
  process.env.FK_CLIENT_CONFIG = file;
  return file;
}

afterEach(() => {
  delete process.env.FK_CLIENT_CONFIG;
});

describe('loadConfig', () => {
  it('parses a full config', () => {
    writeConfig(
      [
        'serverUrl: "http://nas:8080"',
        'apiToken: "fk_abc_def"',
        'clientName: "office-pc"',
        'pollIntervalMs: 5000',
        'deleteAfterBackup: true',
        'ignorePatterns:',
        '  - "*.THM"',
      ].join('\n')
    );
    expect(loadConfig()).toEqual({
      serverUrl: 'http://nas:8080',
      apiToken: 'fk_abc_def',
      clientName: 'office-pc',
      pollIntervalMs: 5000,
      deleteAfterBackup: true,
      ignorePatterns: ['*.THM'],
    });
  });

  it('applies safe defaults for optional fields', () => {
    writeConfig(['serverUrl: "http://nas:8080"', 'apiToken: "fk_a_b"'].join('\n'));
    const config = loadConfig();
    expect(config.clientName).toBe(os.hostname());
    expect(config.pollIntervalMs).toBe(3000);
    expect(config.deleteAfterBackup).toBe(false); // deletion must be opt-in
    expect(config.ignorePatterns).toEqual([]);
  });

  it('strips trailing slashes from the server URL', () => {
    writeConfig(['serverUrl: "http://nas:8080///"', 'apiToken: "fk_a_b"'].join('\n'));
    expect(loadConfig().serverUrl).toBe('http://nas:8080');
  });

  it('fails fast when required fields are missing', () => {
    writeConfig('apiToken: "fk_a_b"');
    expect(() => loadConfig()).toThrow(/serverUrl/);

    writeConfig('serverUrl: "http://nas:8080"');
    expect(() => loadConfig()).toThrow(/apiToken/);
  });

  it('fails with a helpful message when the file does not exist', () => {
    process.env.FK_CLIENT_CONFIG = '/nowhere/config.yaml';
    expect(() => loadConfig()).toThrow(/config\.example\.yaml/);
  });
});
