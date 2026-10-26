// Exercises the production bundle with isolated API fixtures; no real accounts are changed.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist/gpx-map-viewer');
const output = path.resolve(__dirname, '../tmp/wahoo-qa');
fs.mkdirSync(output, { recursive: true });
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
      const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block' });
      await context.addInitScript(() => {
        const token = 'mock.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.mock';
        localStorage.setItem('gpxAuthSession', JSON.stringify({ token, id: 901, nickname: 'Enrique', verified: true, administrator: true, plan: 'ADMIN', exitCode: 0 }));
      });
      let connected = true;
      const activity = { id: 7, trackId: null, name: 'Salida Polar al monte', startTime: '2026-10-22T09:00:00Z', pointCount: 2, status: 'PENDING', distanceKm: 24.5, ascentMeters: 600, durationSeconds: 7200 };
      const polar = [{ ...activity }];
      let wahoo = [{ ...activity, name: 'Salida Wahoo a Collserola', startTime: '2026-10-23T10:00:00Z' }, { ...activity, id: 8, name: 'Segunda salida Wahoo', startTime: '2026-10-23T09:00:00Z' }];
      const garmin = [{ id: 7, trackId: null, rideStart: 1792569600, lastReceivedAt: '2026-10-21T08:00:00Z', pointCount: 2, inboxStatus: 'PENDING', distanceKm: 12.5, ascentMeters: 300, durationSeconds: 3600 }];
      const requests = [];
      await context.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin === base) return route.continue();
        if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue();
        const p = url.pathname;
        requests.push(req.method() + ' ' + p);
        let json = {};
        if (p.endsWith('/auth/me')) json = { userId: 901, nickname: 'Enrique', verified: true, plan: 'ADMIN', administrator: true };
        else if (p.endsWith('/garmin/devices')) json = [{ id: 1, createdAt: '2026-10-01T00:00:00Z', totalPoints: 200 }];
        else if (p.endsWith('/garmin/rides')) json = garmin;
        else if (p.endsWith('/polar/connection')) json = { available: true, connected: true, connectedAt: '2026-10-01T00:00:00Z' };
        else if (p.endsWith('/polar/rides')) json = polar;
        else if (p.endsWith('/wahoo/connection')) {
          if (req.method() === 'DELETE') connected = false;
          json = { available: true, connected, sandbox: true, connectedAt: '2026-10-01T00:00:00Z' };
        } else if (p.endsWith('/wahoo/rides')) json = wahoo;
        else if (p.endsWith('/wahoo/rides/7/incorporate')) {
          wahoo[0] = { ...wahoo[0], trackId: 99, status: 'INCORPORATED' }; json = wahoo[0];
        } else if (p.endsWith('/wahoo/rides/8') && req.method() === 'DELETE') wahoo = wahoo.filter(r => r.id !== 8);
        else if (p.endsWith('/wahoo/rides/7/preview')) json = [[41.4, 2.1], [41.41, 2.11]];
        else if (p.endsWith('/wahoo/sync')) json = { imported: 0, alreadyPresent: 2, withoutGps: 0 };
        else if (/tile\.openstreetmap/.test(url.hostname)) return route.fulfill({ status: 204 });
        return route.fulfill({ json });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.goto(base + '/');
      await page.locator('.dashboard-notice strong', { hasText: '4 rutas nuevas' }).waitFor();
      await page.goto(base + '/garmin?wahoo=connected');
      await page.waitForFunction(() => document.querySelectorAll('.ride-card').length === 4);
      await page.locator('.wahoo-settings').waitFor();
      assert.equal(await page.locator('.polar-settings').count(), 0);
      assert.match(await page.locator('.ride-card').first().innerText(), /Wahoo/);
      assert.match(await page.locator('.connection-heading').innerText(), /3 servicios vinculados/);
      assert.equal(await page.locator('.provider:disabled').count(), 1);
      const logos = await page.locator('.provider-logo').evaluateAll(imgs => imgs.map(img => ({ alt: img.alt, loaded: img.complete && img.naturalWidth > 0 })));
      assert.equal(logos.length, 4);
      assert.ok(logos.every(logo => logo.loaded), 'Every official logo must load');
      const columns = await page.locator('.providers').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      assert.equal(columns, width < 700 ? 2 : 4);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(output, `inbox-${width}.png`), fullPage: true });
      await page.locator('.wahoo-settings .actions button').first().click();
      await page.waitForFunction(() => !document.querySelector('.wahoo-settings .actions button').disabled);
      assert.equal(requests.filter(r => r === 'POST /api/wahoo/sync').length, 1);
      await page.locator('.ride-card').first().getByRole('button', { name: 'Ver recorrido en el mapa' }).click();
      await page.locator('#garmin-preview-map .leaflet-pane').first().waitFor({ state: 'attached' });
      assert.ok(requests.includes('GET /api/wahoo/rides/7/preview'));
      await page.locator('.ride-card').first().getByRole('button', { name: 'Incorporar', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Incorporar', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.ride-card').length === 3);
      assert.match(await page.locator('.incorporated-row').innerText(), /Wahoo/);
      await page.locator('.ride-card').first().getByRole('button', { name: 'Descartar', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.ride-card').length === 2);
      assert.ok(requests.includes('DELETE /api/wahoo/rides/8'));
      await page.getByRole('button', { name: 'Desconectar Wahoo', exact: true }).click();
      await page.getByRole('button', { name: 'Wahoo Pendiente de vincular', exact: true }).waitFor();
      assert.equal(await page.locator('.incorporated-row').count(), 1, 'Disconnect retains imported archive entries');
      assert.equal(await page.locator('.ride-card').count(), 2, 'Same numeric ids from other providers remain intact');
      assert.equal(requests.filter(r => /^(POST|DELETE).*\/(polar|garmin)\//.test(r)).length, 0);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`Wahoo inbox and provider logos ${width}px: passed`);
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
