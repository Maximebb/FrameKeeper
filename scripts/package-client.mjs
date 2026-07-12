// Stages a self-contained Windows client artifact in dist-artifacts/framekeeper-client.
//
// Usage: node scripts/package-client.mjs [vX.Y.Z]
//
// Prerequisites: `npm ci` and builds of @framekeeper/shared and
// @framekeeper/client (run from the repo root).
//
// The staged directory contains everything the client needs at runtime:
//   package.json    client manifest (version stamped from the tag argument)
//   dist/           compiled client (incl. dist/service/{install,uninstall}.js)
//   config.example.yaml
//   node_modules/   production deps (yaml, node-windows) + @framekeeper/shared
//                   copied in as a real directory (no workspace symlinks)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = path.join(root, 'packages', 'client');
const sharedDir = path.join(root, 'packages', 'shared');
const stageDir = path.join(root, 'dist-artifacts', 'framekeeper-client');

const versionArg = process.argv[2];

for (const dir of [path.join(clientDir, 'dist'), path.join(sharedDir, 'dist')]) {
  if (!fs.existsSync(dir)) {
    console.error(`Missing build output: ${dir}. Run the workspace builds first.`);
    process.exit(1);
  }
}

fs.rmSync(stageDir, { recursive: true, force: true });
fs.mkdirSync(stageDir, { recursive: true });

// Client manifest: strip dev-only fields and the workspace dependency on
// @framekeeper/shared (copied in manually below, since "*" would otherwise be
// resolved against the npm registry).
const pkg = JSON.parse(fs.readFileSync(path.join(clientDir, 'package.json'), 'utf8'));
if (versionArg) pkg.version = versionArg.replace(/^v/, '');
delete pkg.devDependencies;
delete pkg.dependencies['@framekeeper/shared'];
pkg.scripts = {
  start: 'node dist/index.js',
  'service:install': 'node dist/service/install.js',
  'service:uninstall': 'node dist/service/uninstall.js',
};
fs.writeFileSync(path.join(stageDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

fs.cpSync(path.join(clientDir, 'dist'), path.join(stageDir, 'dist'), { recursive: true });
fs.cpSync(
  path.join(clientDir, 'config.example.yaml'),
  path.join(stageDir, 'config.example.yaml')
);

execSync('npm install --omit=dev --no-package-lock --no-audit --no-fund', {
  cwd: stageDir,
  stdio: 'inherit',
});

const sharedStage = path.join(stageDir, 'node_modules', '@framekeeper', 'shared');
fs.mkdirSync(sharedStage, { recursive: true });
fs.cpSync(path.join(sharedDir, 'package.json'), path.join(sharedStage, 'package.json'));
fs.cpSync(path.join(sharedDir, 'dist'), path.join(sharedStage, 'dist'), { recursive: true });

console.log(`Client artifact staged at ${stageDir}`);
