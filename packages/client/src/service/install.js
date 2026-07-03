// Registers the FrameKeeper client as a Windows service (runs at boot).
// Usage: npm run service:install  (from packages/client, requires admin shell)
const path = require('node:path');
const { Service } = require('node-windows');

const svc = new Service({
  name: 'FrameKeeper Client',
  description: 'FrameKeeper camera SD card backup client',
  script: path.join(__dirname, '..', 'index.js'),
  env: [{ name: 'FK_CLIENT_CONFIG', value: path.join(__dirname, '..', '..', 'config.yaml') }],
});

svc.on('install', () => {
  console.log('Service installed, starting...');
  svc.start();
});
svc.on('start', () => console.log('FrameKeeper Client service started.'));
svc.on('error', (err) => console.error('Service error:', err));

svc.install();
