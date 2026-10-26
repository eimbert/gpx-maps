// Production UI regressions with isolated mock APIs: no account, saved route or ORS quota is touched.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist/gpx-map-viewer');
const output = path.resolve(__dirname, '../tmp/roundtrip-qa');
fs.mkdirSync(output, { recursive: true });
const gpx = '<gpx><trk><trkseg><trkpt lat="41" lon="2"><ele>100</ele></trkpt><trkpt lat="41" lon="2.02"><ele>110</ele></trkpt><trkpt lat="41.015" lon="2.02"><ele>120</ele></trkpt><trkpt lat="41.015" lon="2"><ele>105</ele></trkpt><trkpt lat="41" lon="2"><ele>100</ele></trkpt></trkseg></trk></gpx>';
const coords = [[2,41,100],[2.02,41,110],[2.02,41.015,120],[2,41.015,105],[2,41,100]];
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
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block' });
      let imports = 0, generations = 0, lastRequest, failSave = false, failGeneration = false, generationError = 'NO_SUITABLE_ROUND_TRIP';
      const track = { id: 801, folderId: 901, name: 'Circular de prueba', routeXml: gpx, createdByUserId: 901, distanceKm: 6.5, desnivel: 20 };
      await context.addInitScript(() => {
        const token = 'mock.' + btoa(JSON.stringify({ exp: Math.floor(Date.now()/1000)+3600 })) + '.mock';
        localStorage.setItem('gpxAuthSession', JSON.stringify({ token, id: 901, nickname: 'prueba', verified: true, exitCode: 0 }));
      });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === base) return route.continue();
        let json = [];
        if (url.pathname.endsWith('/auth/me')) json = { userId: 901, nom: 'Prueba', nickname: 'prueba', plan: 'PREMIUM' };
        else if (url.pathname.endsWith('/plan-folders')) json = [{ id: 901, name: 'Salida de prueba', ownerId: 901, tracksCount: 1, isOwner: true }];
        else if (url.pathname.endsWith('/plan-folders/901/tracks')) json = [track];
        else if (url.pathname.endsWith('/routing/round-trip')) {
          generations++; lastRequest = route.request().postDataJSON();
          if (failGeneration) return route.fulfill({ status: 422, json: { errorCode: generationError } });
          json = { geometry: { coordinates: coords }, distanceMeters: 6500, durationSeconds: 1500, warnings: ['Hay senderos sin dificultad MTB documentada.'], appliedOptions: { traceability: { roadPercent: 8, trackCyclewayPercent: 85 } } };
        } else if (url.pathname.endsWith('/plan-folders/tracks/import')) {
          imports++;
          if (failSave) return route.fulfill({ status: 500, json: {} });
          json = { ...track, id: 802, ...route.request().postDataJSON() };
        } else if (url.pathname.includes('/votes')) json = { votes: [] };
        else if (!url.pathname.includes('/api/') && url.hostname !== 'localhost') return route.abort();
        return route.fulfill({ json });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/plan?folderId=901');
      // :visible also works with older Playwright versions.
      await page.locator('button[aria-label="Animar track en 3D"]:visible').click();
      await page.waitForURL('**/discover?**');
      const payload = await page.evaluate(() => JSON.parse(sessionStorage.getItem('gpxViewerPayload')));
      assert.equal(payload.tipoAnimacion, 'descubrir');
      assert.equal(payload.viewOnly, false);
      assert.equal(payload.tracks.length, 1);
      assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/plan?folderId=901');
      await page.getByRole('button', { name: /Volver/ }).first().click();
      await page.waitForURL('**/plan?folderId=901');
      await page.getByRole('button', { name: 'Generar ruta circular', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Longitud aproximada (km)').fill('');
      assert.equal(await dialog.getByRole('button', { name: 'Elegir punto de inicio' }).isDisabled(), true);
      await dialog.getByLabel('Longitud aproximada (km)').fill('201');
      assert.equal(await dialog.getByRole('button', { name: 'Elegir punto de inicio' }).isDisabled(), true);
      await dialog.getByLabel('Longitud aproximada (km)').fill('6.5');
      await dialog.getByLabel('Bicicleta').selectOption({ label: 'Bici de carretera' });
      assert.equal(await dialog.getByLabel('Prioridad de terreno').count(), 0);
      await dialog.getByLabel('Bicicleta').selectOption({ label: 'Gravel / trekking' });
      await page.waitForTimeout(300); // Let Material's entrance animation finish before visual QA.
      await page.screenshot({ path: path.join(output, `options-${width}.png`) });
      await dialog.getByRole('button', { name: 'Elegir punto de inicio' }).click();
      const map = page.locator('.plan__roundtrip-map');
      await map.click({ position: { x: 130, y: 130 } });
      const marker = map.locator('img.leaflet-marker-icon');
      await marker.waitFor();
      const markerLoaded = await marker.evaluate(async image => {
        if (!image.complete) await new Promise((resolve, reject) => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', reject, { once: true }); });
        return image.naturalWidth > 0;
      });
      assert.ok(markerLoaded, 'Selected start marker image must load');
      assert.equal(generations, 0, 'A map click only selects the start');
      await page.getByRole('button', { name: 'Generar propuesta', exact: true }).click();
      await page.getByRole('button', { name: 'Guardar en salida', exact: true }).waitFor();
      assert.equal(imports, 0, 'Preview must not save automatically');
      assert.equal(lastRequest.profile, 'cycling-regular');
      assert.equal(lastRequest.preferences.mode, 'trails');
      assert.equal(lastRequest.points, undefined);
      await page.getByText('Hay senderos sin dificultad MTB documentada.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Buscar otra propuesta', exact: true }).click();
      await page.getByRole('button', { name: 'Guardar en salida', exact: true }).waitFor();
      assert.equal(generations, 2);
      assert.equal(imports, 0);
      await page.screenshot({ path: path.join(output, `preview-${width}.png`) });
      const saveIsUncovered = await page.getByRole('button', { name: 'Guardar en salida', exact: true }).evaluate(button => {
        const rect = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
      });
      assert.ok(saveIsUncovered, 'Floating help must not cover Save');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      failSave = true;
      await page.getByRole('button', { name: 'Guardar en salida', exact: true }).click();
      await page.getByText('No se pudo guardar la ruta. La propuesta sigue disponible para reintentarlo.').waitFor();
      await page.getByRole('button', { name: 'Aceptar', exact: true }).click();
      await page.getByRole('button', { name: 'Guardar en salida', exact: true }).waitFor();
      failSave = false;
      await page.getByRole('button', { name: 'Guardar en salida', exact: true }).click();
      await page.getByText('Ruta circular guardada en la salida.', { exact: true }).waitFor();
      assert.equal(imports, 2);
      await page.getByRole('button', { name: 'Aceptar', exact: true }).click();
      await page.getByRole('button', { name: 'Generar ruta circular', exact: true }).click();
      await dialog.getByRole('button', { name: 'Elegir punto de inicio' }).click();
      await map.click({ position: { x: 130, y: 130 } });
      failGeneration = true;
      await page.getByRole('button', { name: 'Generar propuesta', exact: true }).click();
      await page.getByText('No se ha encontrado una circular adecuada. Prueba otra distancia o mueve el punto de inicio.').waitFor();
      assert.equal(imports, 2);
      await page.getByRole('button', { name: 'Aceptar', exact: true }).click();
      generationError = 'BROUTER_DATA_MISSING';
      await page.getByRole('button', { name: 'Generar propuesta', exact: true }).click();
      await page.getByText('El servidor todavía no tiene los mapas de rutas de esta zona. Hay que añadir esa cobertura para generar la circular.').waitFor();
      await page.getByRole('button', { name: 'Aceptar', exact: true }).click();
      generationError = 'BROUTER_UPSTREAM_ERROR';
      await page.getByRole('button', { name: 'Generar propuesta', exact: true }).click();
      await page.getByText('El motor de rutas no está disponible. No es un problema del punto de inicio ni de las opciones elegidas.').waitFor();
      await page.getByRole('button', { name: 'Aceptar', exact: true }).click();
      await page.locator('.plan__roundtrip-dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
      assert.equal(await page.locator('.plan__roundtrip-overlay').count(), 0);
      assert.equal(imports, 2);
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(`PASS ${width}px: 3D + return, dialog validation, profile, preview, save retry, no suitable route`);
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
