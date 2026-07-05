// Registers the FrameKeeper client as a Windows service (runs at boot).
// Usage: npm run service:install  (from packages/client, requires admin shell)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Service } = require('node-windows');

/** WinSW service name (node-windows uses `<id>` = `${svc.id}.exe`). */
function serviceName(svc) {
  return `${svc.id}.exe`;
}

// node-windows omits <startmode> from the WinSW XML, so Windows defaults to Manual.
function ensureAutomaticStartup(svc) {
  const name = serviceName(svc);
  const xmlPath = path.join(svc.root, `${svc.id}.xml`);
  let xml = fs.readFileSync(xmlPath, 'utf8');
  if (!xml.includes('<startmode>')) {
    xml = xml.replace('<service>', '<service>\r\n\t<startmode>Automatic</startmode>');
    fs.writeFileSync(xmlPath, xml);
  }
  execSync(`sc config "${name}" start= auto`, { stdio: 'inherit' });
}

try {
  execSync('net session', { stdio: 'ignore' });
} catch {
  console.error(
    'Administrator privileges are required to install a Windows service.\n' +
      'Open an elevated PowerShell, cd to packages/client, and run: npm run service:install'
  );
  process.exit(1);
}

const svc = new Service({
  name: 'FrameKeeper Client',
  description: 'FrameKeeper camera SD card backup client',
  script: path.join(__dirname, '..', 'index.js'),
  workingDirectory: path.join(__dirname, '..', '..'),
  env: [{ name: 'FK_CLIENT_CONFIG', value: path.join(__dirname, '..', '..', 'config.yaml') }],
});

svc.on('install', () => {
  console.log('Service installed, setting startup type to Automatic...');
  ensureAutomaticStartup(svc);
  console.log('Starting service...');
  svc.start();
});
svc.on('alreadyinstalled', () => {
  console.log('Service already installed, verifying startup type...');
  ensureAutomaticStartup(svc);
});
svc.on('start', () => console.log('FrameKeeper Client service started.'));
svc.on('error', (err) => console.error('Service error:', err));

svc.install();
