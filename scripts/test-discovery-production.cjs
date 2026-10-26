// Serve the actual optimized build and run the browser regression against it.
// Requires a production build, Chrome and Playwright (optionally via NODE_PATH).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist/gpx-map-viewer');
assert.deepEqual(fs.readFileSync(path.join(root, 'assets/maplibre/maplibre-gl-csp-worker.js')),
  fs.readFileSync(path.join(__dirname, '../node_modules/maplibre-gl/dist/maplibre-gl-csp-worker.js')),
  'Production must ship the untouched worker from the installed MapLibre version');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    if (path.extname(file)) { res.writeHead(404).end(); return; }
    file = path.join(root, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
server.listen(0, '127.0.0.1', () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`Testing optimized build at ${base}`);
  const child = spawn(process.execPath, [path.join(__dirname, 'test-discovery-browser.cjs')], {
    stdio: 'inherit', env: { ...process.env, DISCOVERY_TEST_URL: base }
  });
  child.on('error', error => { console.error(error); server.close(); process.exitCode = 1; });
  child.on('exit', code => { server.close(); process.exitCode = code ?? 1; });
});
