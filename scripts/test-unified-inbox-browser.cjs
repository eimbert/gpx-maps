const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist/gpx-map-viewer');
const output = path.resolve(__dirname, '../tmp/inbox-qa');
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
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
      const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block' });
      await context.addInitScript(() => {
        const token = 'mock.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.mock';
        localStorage.setItem('gpxAuthSession', JSON.stringify({ token, id: 901, nickname: 'prueba', verified: true, exitCode: 0 }));
      });
      let connected = true;
      let polar = [{ id: 7, trackId: null, name: 'Salida Polar al monte', startTime: '2026-10-22T09:00:00Z', pointCount: 2, status: 'PENDING', distanceKm: 24.5, ascentMeters: 600, durationSeconds: 7200 }];
      let garmin = [{ id: 7, trackId: null, rideStart: 1792569600, lastReceivedAt: '2026-10-21T08:00:00Z', pointCount: 2, inboxStatus: 'PENDING', distanceKm: 12.5, ascentMeters: 300, durationSeconds: 3600 }];
      const requests = [];
      await context.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin === base) return route.continue();
        const p = url.pathname;
        requests.push(req.method() + ' ' + p);
        let json = {};
        if (p.endsWith('/auth/me')) json = { userId: 901, nickname: 'prueba', verified: true, plan: 'PREMIUM' };
        else if (p.endsWith('/garmin/devices')) json = [{ id: 1, createdAt: '2026-10-01T00:00:00Z', totalPoints: 200 }];
        else if (p.endsWith('/garmin/rides')) json = garmin;
        else if (p.endsWith('/polar/connection')) {
          if (req.method() === 'DELETE') connected = false;
          json = { available: true, connected, connectedAt: '2026-10-01T00:00:00Z' };
        } else if (p.endsWith('/polar/rides')) json = polar;
        else if (p.endsWith('/polar/rides/7/incorporate')) {
          polar[0] = { ...polar[0], trackId: 99, status: 'INCORPORATED' }; json = polar[0];
        } else if (p.endsWith('/garmin/rides/7') && req.method() === 'DELETE') garmin = [];
        else if (p.endsWith('/polar/rides/7/preview')) json = [[41.4, 2.1], [41.41, 2.11]];
        else if (p.endsWith('/polar/sync')) json = { imported: 0, alreadyPresent: 1, withoutGps: 0 };
        else if (/tile\.openstreetmap/.test(url.hostname)) return route.fulfill({ status: 204 });
        return route.fulfill({ json });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.goto(base + '/');
      await page.locator('.action-card__badge', { hasText: '2' }).waitFor();
      await page.goto(base + '/garmin');
      await page.locator('.ride-card').first().waitFor();
      await page.waitForFunction(() => document.querySelectorAll('.ride-card').length === 2);
      assert.equal(await page.locator('.pair-instructions').count(), 0);
      assert.equal(await page.locator('.polar-settings').count(), 0);
      assert.match(await page.locator('.ride-card').first().innerText(), /Polar/);
      assert.match(await page.locator('.inbox-toolbar').innerText(), /2 pendientes/);
      assert.equal(await page.locator('.provider:disabled').count(), 1);
      await page.getByRole('button', { name: 'Polar ✓ Vinculado', exact: true }).click();
      await page.getByText(/Se comprueban cada cinco minutos/).waitFor();
      assert.equal(await page.locator('.pair-instructions').count(), 0);
      const height = await page.locator('.polar-settings').evaluate(el => el.getBoundingClientRect().height);
      assert.ok(height < 600, 'Settings must not reserve an empty screen');
      await page.getByRole('button', { name: 'Garmin ✓ Vinculado', exact: true }).click();
      await page.locator('.pair-instructions').waitFor();
      assert.equal(await page.locator('.polar-settings').count(), 0);
      await page.getByRole('button', { name: 'Garmin ✓ Vinculado', exact: true }).click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
      await page.screenshot({ path: path.join(output, `inbox-${width}.png`), fullPage: true });
      await page.locator('.ride-card').first().getByRole('button', { name: 'Ver recorrido en el mapa' }).click();
      await page.locator('#garmin-preview-map').waitFor();
      await page.locator('#garmin-preview-map .leaflet-pane').first().waitFor({ state: 'attached' });
      assert.ok(requests.includes('GET /api/polar/rides/7/preview'));
      await page.locator('.ride-card').first().getByRole('button', { name: 'Incorporar', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Incorporar', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.ride-card').length === 1);
      assert.match(await page.locator('.ride-card').innerText(), /Garmin/);
      assert.match(await page.locator('.incorporated-row').innerText(), /Polar/);
      await page.getByRole('button', { name: 'Polar ✓ Vinculado', exact: true }).click();
      await page.getByRole('button', { name: 'Desconectar Polar', exact: true }).click();
      await page.getByRole('button', { name: 'Polar Pendiente de vincular', exact: true }).waitFor();
      assert.equal(await page.locator('.incorporated-row').count(), 1, 'Disconnect must not hide archive entries');
      await page.locator('.ride-card').getByRole('button', { name: 'Descartar', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.ride-card').length === 0);
      assert.ok(requests.includes('DELETE /api/garmin/rides/7'));
      assert.equal(requests.filter(r => r === 'POST /api/polar/sync').length, 0, 'Automatic reception belongs to the server, not browser polling');
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`Unified inbox ${width}px: passed`);
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
