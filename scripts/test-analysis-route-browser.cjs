// Browser regression for public-analysis links and the analysis close control.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../dist/gpx-map-viewer');
const output = path.resolve(__dirname, '../tmp/analysis-route-qa');
fs.mkdirSync(output, { recursive: true });
const points = Array.from({ length: 20 }, (_, i) => ({
  lat: 41.47 + .005 * Math.sin(i / 19 * Math.PI),
  lon: 2.22 + .01 * i / 19
}));
const gpx = `<gpx version="1.1" creator="browser test"><trk><name>Ruta compartida</name><trkseg>${points.map((point, i) => `<trkpt lat="${point.lat}" lon="${point.lon}"><ele>100</ele><time>${new Date(Date.UTC(2026, 9, 16, 8, 0, i * 20)).toISOString()}</time></trkpt>`).join('')}</trkseg></trk></gpx>`;
const report = { summary: 'Ruta de prueba.', routeType: 'mixta', difficultyExplanation: 'Dificultad media.', highlights: [], warnings: [], recommendations: [], sectors: [] };
const analyses = [
  { id: 7, trackId: 42, title: 'Ruta compartida', fileName: 'ruta.gpx', createdAt: '2026-10-16T08:00:00', routeStats: { distanceKm: 4.2, elevationGainM: 100, elevationProfile: [] }, report },
  { id: 8, trackId: null, title: 'GPX huérfano', fileName: 'huérfano.gpx', createdAt: '2026-10-15T08:00:00', routeStats: { distanceKm: 3.1, elevationGainM: null, elevationProfile: [] }, report },
  { id: 9, trackId: 43, title: 'Ruta propia', fileName: 'propia.gpx', createdAt: '2026-10-14T08:00:00', routeStats: { distanceKm: 4.2, elevationGainM: 100, elevationProfile: [] }, report }
];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (path.relative(root, file).startsWith('..')) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      await context.addInitScript(() => {
        const token = 'mock.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.mock';
        localStorage.setItem('gpxAuthSession', JSON.stringify({ token, id: 901, nickname: 'prueba', verified: true, exitCode: 0 }));
      });
      let gpxCalls = 0;
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === base || /tile\.openstreetmap|ign\.es|opentopomap|arcgisonline|fonts\.(googleapis|gstatic)/.test(url.hostname)) return route.continue();
        if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: { userId: 901, nickname: 'prueba', plan: 'PREMIUM' } });
        if (url.pathname.endsWith('/route-analysis/public')) return route.fulfill({ json: analyses });
        if (url.pathname.endsWith('/tracks/42/gpx')) { gpxCalls++; return route.fulfill({ json: { id: 42, fileName: 'ruta.gpx', routeXml: gpx } }); }
        if (url.pathname.endsWith('/tracks/43/gpx')) return route.fulfill({ json: { id: 43, fileName: 'propia.gpx', routeXml: gpx } });
        if (url.pathname.endsWith('/tracks/me')) return route.fulfill({ json: [{ id: 43, fileName: 'propia.gpx', createdBy: 901, shared: false }] });
        if (url.pathname.endsWith('/tracks/shared') || url.pathname.endsWith('/routes')) return route.fulfill({ json: [] });
        return route.fulfill({ json: [] });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(base + '/load?mode=routes&view=archive');
        await page.getByRole('button', { name: 'Ver análisis públicos de rutas' }).click();
        await page.locator('.analysis-library__row').first().waitFor();
        assert.equal(await page.locator('.analysis-library__row').count(), 2, 'Analyses without a saved track stay hidden');
        assert.equal(await page.locator('.analysis-library__row .analysis-library__route-link').count(), 2);
        const sharedRow = page.locator('.analysis-library__row').filter({ hasText: 'Ruta compartida' });
        await sharedRow.getByRole('button', { name: 'Ver análisis' }).click();
        await page.locator('.analysis-library__detail').waitFor();
        await page.screenshot({ path: path.join(output, `analysis-${width}.png`) });
        const close = page.getByRole('button', { name: 'Cerrar análisis' });
        assert.ok(await close.evaluate(button => { const rect = button.getBoundingClientRect(); return rect.width >= 36 && rect.height >= 36; }), 'Close control is touch-sized');
        await close.click();
        await page.locator('.analysis-library__detail').waitFor({ state: 'detached' });
        await sharedRow.getByRole('button', { name: 'Ver ruta' }).click();
        await page.locator('.editor-header').waitFor();
        assert.equal(await page.locator('.editor-identity h1').textContent(), 'Ruta compartida');
        assert.equal(await page.getByRole('button', { name: 'Editar recorrido' }).count(), 0, 'Shared routes are read-only');
        assert.equal(gpxCalls, 1);
        await page.getByRole('button', { name: 'Volver', exact: true }).click();
        await page.locator('.analysis-library__row').first().waitFor();
        assert.equal(await page.locator('.user-tracks__tab--active').getAttribute('aria-label'), 'Ver análisis públicos de rutas');
        await page.locator('.analysis-library__row').filter({ hasText: 'Ruta propia' }).getByRole('button', { name: 'Ver ruta' }).click();
        await page.getByRole('button', { name: 'Editar recorrido' }).waitFor();
        assert.deepEqual(errors, []);
        console.log(`PASS ${width}px: orphan analysis hidden; shared route read-only, own route editable; close works`);
      } catch (error) {
        try { await page.screenshot({ path: path.join(output, `failure-${width}.png`), timeout: 3000 }); } catch {}
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
