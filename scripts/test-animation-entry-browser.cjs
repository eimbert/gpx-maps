const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../dist/gpx-map-viewer');
const gpx = fs.readFileSync(path.resolve(__dirname, '../src/assets/track.gpx'), 'utf8');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((request, response) => {
  let file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
  if (path.relative(root, file).startsWith('..')) return response.writeHead(403).end();
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, 'index.html');
  response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});
const track = { id: 901, title: 'Vuelta por el Pirineo', fileName: 'pirineo.gpx', routeId: null,
  province: 'Huesca', autonomousCommunity: 'Aragón', population: 'Aínsa', distanceKm: 32.5,
  ascentMeters: 740, timeSeconds: 7200, uploadedAt: '2026-10-01', createdBy: 901 };

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
        localStorage.setItem('tracketeo.language', 'es');
      });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === base) return route.continue();
        if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue();
        let json = [];
        if (url.pathname.endsWith('/auth/me')) json = { userId: 901, nickname: 'prueba', plan: 'PREMIUM' };
        if (url.pathname.endsWith('/tracks/me')) json = [track];
        if (url.pathname.endsWith('/tracks/901/gpx')) json = { id: 901, fileName: 'pirineo.gpx', routeXml: gpx };
        return route.fulfill({ json });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/load?mode=routes&view=archive');
      await page.locator('.archive-destination').first().click();
      await page.locator('.route-explorer-card').waitFor();
      await page.locator('#routeArchive').evaluate(element => { element.style.minHeight = '1600px'; });
      await page.locator('.route-workspace').evaluate(element => { element.scrollTop = element.scrollHeight; });
      const before = await page.locator('.route-workspace').evaluate(element => element.scrollTop);
      assert.ok(before > 0, 'Archive starts scrolled down');
      await page.locator('.route-explorer-card').getByRole('button', { name: 'Animar', exact: true }).click();
      await page.locator('.selection-note').waitFor();
      assert.equal(await page.locator('.route-workspace').evaluate(element => element.scrollTop), 0,
        'Animation starts at the top');
      assert.match(await page.locator('.selection-note').innerText(), /Vuelta por el Pirineo/);
      assert.ok(await page.locator('.selection-note').evaluate(element => element.compareDocumentPosition(document.querySelector('.animation-types')) & Node.DOCUMENT_POSITION_FOLLOWING),
        'Selected route appears before animation choices');
      assert.deepEqual(errors, []);
      console.log(`Animation entry ${width}px: starts at top with selected route above choices`);
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
