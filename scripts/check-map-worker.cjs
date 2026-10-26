// Check the deployed MapLibre worker, including SPA rewrites returning HTML/200.
// Usage: node scripts/check-map-worker.cjs https://www.tracketeo.bike/
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const version = require('maplibre-gl/package.json').version;
const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base)) {
  console.error('Uso: node scripts/check-map-worker.cjs https://www.tracketeo.bike/');
  process.exit(1);
}
const url = new URL(`assets/maplibre/maplibre-gl-csp-worker.js?v=${version}`, base.endsWith('/') ? base : `${base}/`);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
(async () => {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !/(?:java|ecma)script/i.test(contentType) || /^\s*</.test(bytes.toString('utf8', 0, 100))) {
    throw new Error(`El worker no es JavaScript: HTTP ${response.status}, Content-Type ${contentType}. `
      + 'Comprueba que assets/maplibre/maplibre-gl-csp-worker.js se publicó y que el servidor no lo sustituye por index.html.');
  }
  const expected = fs.readFileSync(path.join(__dirname, '../node_modules/maplibre-gl/dist/maplibre-gl-csp-worker.js'));
  if (hash(bytes) !== hash(expected)) throw new Error(`El worker publicado no coincide con MapLibre ${version} instalado en este proyecto.`);
  console.log(`OK: worker MapLibre ${version}, JavaScript y contenido correctos (${bytes.length} bytes).`);
})().catch(error => { console.error(`${url}\n${error.message}`); process.exitCode = 1; });
