const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../dist/gpx-map-viewer');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (path.relative(root, file).startsWith('..')) return res.writeHead(403).end();
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const track = { id: 901, title: 'Ruta de prueba', fileName: 'ruta.gpx', routeId: null, province: 'Huesca',
  autonomousCommunity: 'Aragón', comarca: 'Sobrarbe', population: 'Aínsa', distanceKm: 32,
  ascent: 740, timeSeconds: 7200, uploadedAt: '2026-10-01', createdBy: 901 };

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      await context.addInitScript(() => {
        const token = 'mock.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.mock';
        localStorage.setItem('gpxAuthSession', JSON.stringify({ token, id: 901, nickname: 'prueba', verified: true, exitCode: 0 }));
        if (!localStorage.getItem('tracketeo.language')) localStorage.setItem('tracketeo.language', 'es');
      });
      const requests = [];
      let refreshes = 0;
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === base) return route.continue();
        let json = [];
        if (url.pathname.endsWith('/auth/me')) json = { userId: 901, nickname: 'prueba', plan: 'PREMIUM' };
        if (url.pathname.endsWith('/tracks/me')) json = [track];
        if (url.pathname.endsWith('/destination-descriptions/resolve')) {
          const body = route.request().postDataJSON();
          requests.push(body);
          json = body.places.map(place => ({ ...place, description:
            place.type === 'population' && place.name === 'Aínsa' && place.context === 'Huesca'
              ? 'Descripción original guardada de Aínsa.' : '' }));
        }
        if (url.pathname.endsWith('/destination-descriptions/refresh')) {
          refreshes++;
          assert.equal(route.request().postDataJSON().language, 'ca');
          json = { description: 'Descripció renovada en català.' };
        }
        return route.fulfill({ json });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/load?mode=routes&view=archive');
      await page.locator('.destination-card').first().waitFor();
      await page.locator('.archive-filters summary').click();
      const select = page.locator('.archive-filters select');
      for (const value of ['population', 'province', 'comarca', 'autonomousCommunity', 'province']) {
        await select.selectOption(value);
        await page.locator('.archive-filters summary').click();
        await page.locator('.archive-filters summary').click();
        assert.equal(await select.inputValue(), value, `Selection survives change detection: ${value}`);
      }
      await select.selectOption('population');
      await page.reload();
      await page.locator('.destination-card').first().waitFor();
      assert.equal(await select.inputValue(), 'population', 'Grouping survives reload');
      await page.locator('.destination-card').first().click();
      await page.locator('.route-explorer-card .place-description p').waitFor();
      assert.equal(await page.locator('.route-explorer-card .place-description p').textContent(), 'Descripción original guardada de Aínsa.');
      assert.ok(requests.some(body => body.places.some(p => p.type === 'population' && p.name === 'Aínsa' && p.context === 'Huesca')));
      await page.evaluate(() => localStorage.setItem('tracketeo.language', 'ca'));
      await page.reload();
      await page.locator('.destination-card').first().waitFor();
      await page.locator('.destination-card').first().click();
      await page.locator('.route-explorer-card .place-description p').waitFor();
      assert.equal(await page.locator('.route-explorer-card .place-description p').textContent(), 'Descripción original guardada de Aínsa.');
      assert.equal(refreshes, 0, 'Changing language does not refresh stored descriptions');
      await page.locator('.route-explorer-card .place-description__refresh').click();
      await page.getByText('Descripció renovada en català.', { exact: true }).waitFor();
      assert.equal(refreshes, 1);
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: selection, return to province, reload, saved population description, explicit refresh`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
