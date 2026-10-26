// Local regression with synthetic GPX profiles and mocked backend responses.
// Run after a development build, with Playwright available in NODE_PATH.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist/gpx-map-viewer');
const output = path.resolve(__dirname, '../tmp/slopes-qa');
fs.mkdirSync(output, { recursive: true });
const tracks = [0, 1, 2].map(track => {
  let ele = 200;
  return { trkpts: Array.from({ length: 401 - track * 40 }, (_, i) => {
    const grade = [2, 7, 12, -12, -7, -2][Math.min(5, Math.floor(i / 67))];
    ele += grade / 10 * (track + 1);
    return { lat: 41.6 + track * .01, lon: 2 + i * 10 / (111195 * Math.cos(41.6 * Math.PI / 180)),
      ele: track === 2 && i > 150 && i < 230 ? null : ele,
      time: new Date(Date.UTC(2026, 9, 21, 8, 0, i * 20)).toISOString(), segment: 0 };
  }) };
});
const seed = { viewOnly: true, tracks, names: ['Ruta de pendientes conocidas.gpx', 'Segunda ruta.gpx', 'Ruta con altitud incompleta.gpx'], colors: ['#2563eb', '#7c3aed', '#0891b2'], mostrarPerfil: true, activarMusica: false };
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
      await context.addInitScript(payload => {
        const token = 'mock.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.mock';
        localStorage.setItem('gpxAuthSession', JSON.stringify({ token, id: 901, nickname: 'prueba', verified: true, exitCode: 0 }));
        sessionStorage.setItem('gpxViewerPayload', JSON.stringify(payload));
      }, seed);
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === base || /tile\.openstreetmap|ign\.es|fonts\.(googleapis|gstatic)/.test(url.hostname)) return route.continue();
        if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: { userId: 901, nickname: 'prueba', plan: 'PREMIUM' } });
        return route.fulfill({ json: {} });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/map?from=plan&folderId=901');
      await page.waitForFunction(() => {
        const host = document.querySelector('app-map');
        const component = host && window.ng?.getComponent(host);
        return component?.trackMetas.length === 3 && component.trackMetas.every(meta => meta.slopeSvgGroups?.length === 5) && !component.map.isMoving();
      });
      const checks = page.locator('.editor-track-list input[type=checkbox]');
      if (!await checks.first().isVisible()) await page.getByRole('button', { name: 'Opciones del mapa', exact: true }).click();
      assert.equal(await checks.count(), 3);
      await page.locator('.slope-legend').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('.slope-legend').innerText().then(text => text.includes('Solo subidas') && text.includes('≥ 10 %')));
      const inspect = index => page.evaluate(index => {
        const component = window.ng.getComponent(document.querySelector('app-map'));
        const meta = component.trackMetas[index];
        return {
          visible: meta.visible,
          layers: [meta.fullLayerId, meta.progLayerId, meta.fullSlopeLayerId, meta.progSlopeLayerId].map(id => component.map.getLayoutProperty(id, 'visibility')),
          svg: [meta.fullSvgPath, meta.progSvgPath, ...meta.slopeSvgGroups.map(group => group.path)].map(p => ({ display: p.style.display, d: p.getAttribute('d') || '' })),
          colors: meta.slopeSvgGroups.filter(group => group.segments.length).map(group => group.path.getAttribute('stroke')),
          markers: [meta.startMark, meta.endMark, meta.hoverMark, ...meta.tickMarkers, ...meta.endpointLabelMarkers].map(marker => marker.getElement().style.display)
        };
      }, index);
      assert.deepEqual((await inspect(0)).colors, ['#16a34a', '#facc15', '#dc2626', '#2563eb']);
      assert.ok((await inspect(2)).colors.includes('#64748b'));
      const radios = page.locator('input[name=primary-route]');
      assert.equal(await radios.count(), 3);
      const originalStats = await page.locator('.editor-stats').innerText();
      const originalProfile = await page.evaluate(() => window.ng.getComponent(document.querySelector('app-map')).profileVisual.points);
      await radios.nth(1).check();
      assert.equal(await page.locator('input[name=primary-route]:checked').count(), 1);
      assert.equal(await page.locator('.editor-identity h1').innerText(), seed.names[1]);
      assert.notEqual(await page.locator('.editor-stats').innerText(), originalStats);
      assert.notEqual(await page.evaluate(() => window.ng.getComponent(document.querySelector('app-map')).profileVisual.points), originalProfile);
      assert.equal(await page.locator('.editor-track-list input[type=checkbox]:checked').count(), 3);
      await radios.nth(2).check();
      assert.equal(await page.locator('.editor-identity h1').innerText(), seed.names[2]);
      assert.equal(await page.evaluate(() => window.ng.getComponent(document.querySelector('app-map')).profileVisual), null);
      await radios.nth(1).check();
      await page.screenshot({ path: path.join(output, `slopes-${width}.png`) });
      for (let index = 0; index < 3; index++) {
        const initial = await inspect(index);
        await checks.nth(index).uncheck();
        const hidden = await inspect(index);
        assert.ok(!hidden.visible && hidden.layers.every(value => value === 'none'));
        assert.ok(hidden.svg.every(svg => svg.display === 'none' && svg.d === ''));
        assert.ok(hidden.markers.every(display => display === 'none'));
        assert.ok((await inspect((index + 1) % 3)).visible);
        await checks.nth(index).check();
        const shown = await inspect(index);
        assert.ok(shown.visible && shown.layers.every(value => value === 'visible'));
        assert.deepEqual(shown.colors, initial.colors);
        assert.deepEqual(shown.svg, initial.svg);
      }
      await radios.nth(0).check();
      await checks.nth(0).uncheck();
      assert.ok(await radios.nth(1).isChecked());
      assert.ok(await radios.nth(0).isDisabled());
      assert.equal(await page.locator('.editor-identity h1').innerText(), seed.names[1]);
      await checks.nth(1).uncheck();
      assert.ok(await radios.nth(2).isChecked());
      assert.ok(await checks.nth(2).isDisabled());
      assert.ok(await checks.nth(2).isChecked());
      await checks.nth(0).check();
      await checks.nth(2).uncheck();
      assert.ok(await radios.nth(0).isChecked());
      assert.ok(await checks.nth(0).isDisabled());
      await page.locator('#editor-map-layer').selectOption({ label: 'Callejero (OpenStreetMap)' });
      for (let index = 0; index < 3; index++) assert.ok((await inspect(index)).layers.every(value => value === (index === 0 ? 'visible' : 'none')));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: slope colours, legend, complete visibility, independent tracks and basemap changes`);
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
