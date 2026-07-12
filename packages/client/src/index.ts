import { loadConfig } from './config';
import { ServerApi } from './api';
import { listCameraCards } from './drives';
import { runBackup } from './backup';

async function main(): Promise<void> {
  const config = loadConfig();
  const api = new ServerApi(config);
  console.log(
    `FrameKeeper client "${config.clientName}" watching for camera cards; server=${config.serverUrl}, deleteAfterBackup=${config.deleteAfterBackup}`
  );

  const seen = new Set<string>();
  const busy = new Set<string>();

  const tick = async () => {
    let cards;
    try {
      cards = await listCameraCards();
    } catch (err) {
      console.error('drive scan failed:', (err as Error).message);
      return;
    }

    const present = new Set(cards.map((c) => c.root));
    // Forget removed cards so re-inserting triggers a new prompt.
    for (const root of seen) {
      if (!present.has(root)) seen.delete(root);
    }

    for (const card of cards) {
      if (seen.has(card.root) || busy.has(card.root)) continue;
      seen.add(card.root);
      busy.add(card.root);
      console.log(`camera card detected: ${card.label} at ${card.root}`);
      runBackup(config, api, card)
        .catch((err) => console.error(`backup of ${card.label} failed:`, (err as Error).message))
        .finally(() => busy.delete(card.root));
    }
  };

  await tick();
  setInterval(tick, config.pollIntervalMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
