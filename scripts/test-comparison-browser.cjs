// Browser smoke test for the two-track animation workspace and its playback controls.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../dist/gpx-map-viewer');
const output = path.resolve(__dirname, '../tmp/comparison-qa');
fs.mkdirSync(output, { recursive: true });
const points = (offset) => Array.from({ length: 90 }, (_, i) => ({
  lat: 41.477 + .008 * Math.sin(i / 89 * Math.PI * 2) + offset,
  lon: 2.225 + .011 * Math.cos(i / 89 * Math.PI * 2),
  ele: 130 + Math.round(45 * Math.sin(i / 89 * Math.PI * 3)),
  time: new Date(Date.UTC(2026, 9, 16, 8, 0, i * 15)).toISOString()
}));
const payload = {
  viewOnly: false, tracks: [{ trkpts: points(0) }, { trkpts: points(.0004) }],
  names: ['Pota 2024', 'Pota 2025'], colors: ['#2563eb', '#7c3aed'],
  mostrarPerfil: true, activarMusica: false, rmstops: true
};
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
      await context.addInitScript(seed => {
        const token = 'mock.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.mock';
        localStorage.setItem('gpxAuthSession', JSON.stringify({ token, id: 901, nickname: 'prueba', verified: true, exitCode: 0 }));
        sessionStorage.setItem('gpxViewerPayload', JSON.stringify(seed));
      }, payload);
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === base || /tile\.openstreetmap|ign\.es|opentopomap|arcgisonline|fonts\.(googleapis|gstatic)/.test(url.hostname)) return route.continue();
        if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: { userId: 901, nickname: 'prueba', plan: 'PREMIUM' } });
        if (url.pathname.endsWith('/animations') || url.pathname.endsWith('/animations/claim')) {
          return route.fulfill({ json: { allowed: true, nextAvailableAt: null, daysRemaining: 0, plan: 'PREMIUM' } });
        }
        return route.fulfill({ json: {} });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(base + '/map');
        await page.locator('.comparison-header').waitFor();
        assert.equal(await page.locator('.comparison-track').count(), 2);
        assert.equal(await page.locator('.map-ui').count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Editar recorrido' }).count(), 0);
        assert.equal(await page.locator('.profile-overlay').count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
        await page.getByRole('button', { name: 'Mostrar u ocultar perfil del primer track' }).click();
        await page.locator('.comparison-workspace .profile-overlay').waitFor();
        assert.equal(await page.locator('.comparison-profile-heading').count(), 1);
        await page.getByRole('button', { name: 'Ocultar perfil', exact: true }).click();
        await page.locator('.comparison-workspace .profile-overlay').waitFor({ state: 'detached' });
        await page.getByRole('button', { name: 'Opciones del mapa' }).click();
        await page.locator('.comparison-options').waitFor();
        await page.getByRole('button', { name: 'Cerrar opciones' }).click();
        await page.getByRole('button', { name: 'Ocultar Pota 2025' }).click();
        assert.equal(await page.getByRole('button', { name: 'Mostrar Pota 2025' }).count(), 1);
        await page.getByRole('button', { name: 'Mostrar Pota 2025' }).click();
        await page.getByRole('button', { name: 'Pausar carrera' }).waitFor({ state: 'visible', timeout: 15000 });
        await page.getByRole('button', { name: 'Pausar carrera' }).click();
        const paused = await page.locator('.comparison-time').textContent();
        await page.waitForTimeout(600);
        assert.equal(await page.locator('.comparison-time').textContent(), paused, 'The race clock stays frozen');
        assert.equal(await page.getByText('EN PAUSA').count(), 1);
        await page.screenshot({ path: path.join(output, `comparison-${width}.png`) });
        await page.getByRole('button', { name: 'Reanudar carrera' }).click();
        await page.waitForTimeout(650);
        assert.notEqual(await page.locator('.comparison-time').textContent(), paused, 'The race clock resumes');
        if (width === 1440) {
          await page.locator('.ranking-panel').waitFor({ timeout: 40000 });
          assert.equal(await page.locator('.ranking-list li').count(), 2, 'Final ranking retains both tracks');
          await page.screenshot({ path: path.join(output, 'comparison-ranking.png') });
          await page.getByRole('button', { name: 'Salir', exact: true }).click();
          await page.waitForURL(url => url.pathname === '/', { timeout: 10000 });
        }
        assert.deepEqual(errors, []);
        console.log(`PASS ${width}px: comparison layout, track legend, profile, options, pause and resume${width === 1440 ? ', final ranking exit' : ''}`);
      } catch (error) {
        try { await page.screenshot({ path: path.join(output, `failure-${width}.png`), timeout: 3000 }); } catch { /* Preserve the original failure. */ }
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
