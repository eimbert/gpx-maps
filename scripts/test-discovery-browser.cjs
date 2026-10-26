// Optional browser smoke test: requires Playwright and a running development server.
// NODE_PATH may point to a shared Playwright installation.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.DISCOVERY_TEST_URL || 'http://127.0.0.1:4201';
const output = process.env.DISCOVERY_TEST_OUTPUT || path.join(__dirname, '../tmp/discovery-qa');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    const workers = [];
    // Optional place-service failure must never stop the main animation.
    await page.route('**/geocode/route-places', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    page.on('worker', worker => workers.push(worker.url()));
    page.on('pageerror', e => { errors.push(e.message); console.error('Browser error:', e.message); });
    await page.goto(`${base}/discover`);
    await page.getByText('Tu próxima ruta empieza aquí').waitFor();
    assert.equal(await page.locator('app-assistant-widget').count(), 0);
    await page.goto(`${base}/load?mode=routes`);
    await page.getByRole('button', { name: /Descubrir ruta.*Elegir ruta/ }).click();
    await page.locator('input[type=file]').first().setInputFiles(path.join(__dirname, '../src/assets/track.gpx'));
    await page.getByRole('button', { name: 'Configurar animación' }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('heading', { name: 'Descubrir ruta', exact: true }).waitFor();
    assert.equal(await page.locator('.animation-choices').count(), 0);
    await page.getByText('Duración automática', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Duración del vídeo', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Zoom a la cabeza de carrera').count(), 0);
    await page.screenshot({ path: path.join(output, 'discovery-options.png') });
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.waitForURL('**/discover?**');
    await page.getByRole('button', { name: 'Descubrir ruta', exact: false }).waitFor({ timeout: 30000 });
    const durationLabel = await page.locator('.route-stats span').last().innerText();
    const durationParts = durationLabel.match(/^(\d+) min(?: (\d+) s)?$/);
    assert.ok(durationParts, `Expected automatic duration, got: ${durationLabel}`);
    const durationSeconds = Number(durationParts[1]) * 60 + Number(durationParts[2] || 0);
    assert.ok(durationSeconds >= 60);
    await page.screenshot({ path: path.join(output, 'discovery-overview.png') });
    await page.getByRole('button', { name: 'Descubrir ruta', exact: false }).click();
    await page.waitForTimeout(13000);
    await page.getByRole('button', { name: 'Pausar', exact: false }).click();
    await page.screenshot({ path: path.join(output, 'discovery-flight.png') });
    const progress = Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'));
    assert.ok(progress > 1 && progress < 100, `Progress ${progress}`);
    await page.waitForTimeout(400);
    assert.equal(Number(await page.getByRole('progressbar').getAttribute('aria-valuenow')), progress);
    await page.getByRole('button', { name: 'Continuar', exact: false }).click();
    await page.getByRole('button', { name: /Volver a descubrir/ }).waitFor({ timeout: (durationSeconds + 15) * 1000 });
    assert.equal(Number(await page.getByRole('progressbar').getAttribute('aria-valuenow')), 100);
    await page.screenshot({ path: path.join(output, 'discovery-end.png') });
    assert.deepEqual(errors, []);
    assert.ok(workers.length > 0 && workers.every(url => url.includes('/assets/maplibre/maplibre-gl-csp-worker.js?v=')),
      `Expected standalone workers, got: ${workers.join(', ')}`);
    console.log('PASS upload, mode selection, 3D playback, pause, resume and final overview');
    const payload = await page.evaluate(() => JSON.parse(sessionStorage.getItem('gpxViewerPayload')));
    payload.tracks = [{ trkpts: [] }, { trkpts: payload.tracks[0].trkpts.map(({ lat, lon, ele }) => ({ lat, lon, ele })) }];
    payload.names = ['Track vacío', 'Ruta sin tiempos'];
    payload.trackDescubrir = 1;
    payload.relacionAspectoGrabacion = '9:16';
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    let placeRequests = 0;
    await mobile.route('**/geocode/route-places', route => {
      placeRequests++;
      return route.fulfill({ json: payload.tracks[1].trkpts.filter((_, i) => i % 30 === 0).slice(0, 500)
        .map((p, i) => ({ id: String(i + 1), lat: p.lat, lon: p.lon, radius: 1000, name: 'Población de prueba' })) });
    });
    mobile.on('pageerror', e => errors.push(e.message));
    await mobile.addInitScript(p => {
      sessionStorage.setItem('gpxViewerPayload', JSON.stringify(p));
      const token = 'test.' + btoa(JSON.stringify({exp: Math.floor(Date.now()/1000)+3600})) + '.test';
      localStorage.setItem('gpxAuthSession', JSON.stringify({id: 1, token, verified: false}));
    }, payload);
    await mobile.route('**/terrarium/**', route => route.abort());
    await mobile.goto(`${base}/discover?from=routes`);
    await mobile.getByRole('heading', { name: 'Ruta sin tiempos', exact: true }).waitFor();
    await mobile.getByRole('button', { name: /Descubrir ruta/ }).waitFor({ timeout: 30000 });
    await mobile.getByText('Relieve no disponible.', { exact: false }).waitFor({ timeout: 10000 });
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await mobile.getByRole('button', { name: /Descubrir ruta/ }).click();
    await mobile.waitForTimeout(8000);
    await mobile.getByRole('button', { name: /Pausar/ }).click();
    await mobile.screenshot({ path: path.join(output, 'discovery-mobile.png') });
    await mobile.locator('.place-label--visible').waitFor();
    assert.equal(await mobile.locator('.place-label strong').textContent(), 'Población de prueba');
    assert.equal(placeRequests, 1);
    assert.ok(Number(await mobile.getByRole('progressbar').getAttribute('aria-valuenow')) > 0);
    await mobile.getByRole('button', { name: 'Volver a los tracks' }).click();
    await mobile.waitForURL('**/load?**');
    assert.deepEqual(errors, []);
    console.log('PASS mobile layout, selected track, missing timestamps, terrain failure and teardown');
    const recovery = await browser.newPage();
    await recovery.route('**/geocode/route-places', route => route.abort());
    await recovery.addInitScript(p => {
      if (!window.name.startsWith('gpxViewerPayload:')) sessionStorage.setItem('gpxViewerPayload', JSON.stringify(p));
    }, payload);
    await recovery.route('**/maplibre-gl-csp-worker.js*', route => route.abort());
    await recovery.goto(`${base}/discover`);
    await recovery.getByRole('heading', { name: 'No se pudo cargar el paisaje' }).waitFor({ timeout: 35000 });
    assert.equal(await recovery.getByText('Preparando el paisaje…').count(), 0);
    await recovery.evaluate(() => { sessionStorage.removeItem('gpxViewerPayload'); history.replaceState({}, ''); });
    await recovery.unroute('**/maplibre-gl-csp-worker.js*');
    await recovery.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await recovery.getByRole('button', { name: /Descubrir ruta/ }).waitFor({ timeout: 30000 });
    await recovery.getByRole('heading', { name: 'Ruta sin tiempos', exact: true }).waitFor();
    console.log('PASS failed worker stops loading and retry recovers');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
