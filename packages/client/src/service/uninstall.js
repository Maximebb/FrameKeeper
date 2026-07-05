// Removes the FrameKeeper client Windows service.
const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
  name: 'FrameKeeper Client',
  script: path.join(__dirname, '..', 'index.js'),
});

svc.on('uninstall', () => console.log('FrameKeeper Client service removed.'));
svc.on('error', (err) => console.error('Service error:', err));

svc.uninstall();
