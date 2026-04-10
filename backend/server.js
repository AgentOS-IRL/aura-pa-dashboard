const fs = require('fs');
const path = require('path');

const distEntryPath = path.join(__dirname, 'dist', 'index.js');

if (!fs.existsSync(distEntryPath)) {
  throw new Error(
    'Backend bundle missing. Run "npm run build" inside backend/ before starting the container.'
  );
}

const backendEntry = require(distEntryPath);

if (typeof backendEntry.startServer !== 'function') {
  throw new Error('Compiled backend entry does not export startServer().');
}

const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const message =
  '🚀 Starting backend via backend/server.js (node backend/server.js).';

function run() {
  console.log(message);
  return backendEntry.startServer();
}

if (require.main === module) {
  run();
}

module.exports = {
  createApp: backendEntry.createApp,
  startServer: backendEntry.startServer,
  ensureUploads: () => fs.mkdirSync(uploadsDir, { recursive: true }),
  uploadsDir,
};
