import fs from 'fs';
import path from 'path';
import os from 'os';
import { parse } from 'yaml';

export interface ClientConfig {
  serverUrl: string;
  apiToken: string;
  clientName: string;
  pollIntervalMs: number;
  deleteAfterBackup: boolean;
  ignorePatterns: string[];
}

export function loadConfig(): ClientConfig {
  const configPath =
    process.env.FK_CLIENT_CONFIG ?? path.join(__dirname, '..', 'config.yaml');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Client config not found at ${configPath}. Copy config.example.yaml to config.yaml and fill in serverUrl/apiToken.`
    );
  }
  const raw = parse(fs.readFileSync(configPath, 'utf8')) as Partial<ClientConfig>;
  if (!raw.serverUrl) throw new Error('config.yaml: serverUrl is required');
  if (!raw.apiToken) throw new Error('config.yaml: apiToken is required');
  return {
    serverUrl: raw.serverUrl.replace(/\/+$/, ''),
    apiToken: raw.apiToken,
    clientName: raw.clientName ?? os.hostname(),
    pollIntervalMs: raw.pollIntervalMs ?? 3000,
    deleteAfterBackup: raw.deleteAfterBackup ?? false,
    ignorePatterns: raw.ignorePatterns ?? [],
  };
}
