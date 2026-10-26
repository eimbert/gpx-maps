// Deterministic network regressions; no route coordinates leave this process.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
function compile(file, globals = {}) {
  const context = { exports: {}, ...globals };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/utils/', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
  }).outputText, context);
  return context.exports;
}
const routes = compile('discovery-route.ts');
const route = routes.prepareDiscoveryRoute([{ lat: 0, lon: 0 }, { lat: 0, lon: 0.01 }]);
const data = [{ id: 'village-1', lat: 0, lon: 0, name: 'Pueblo', radius: 700 }];
const ok = (body = data) => ({ ok: true, json: async () => body });
function setup(fetch, timer = setTimeout) {
  return compile('discovery-places.ts', { require: () => routes, fetch, AbortController, URLSearchParams,
    setTimeout: timer, clearTimeout });
}
async function load(api, signal = new AbortController().signal) { return api.loadDiscoveryPlaces(route, signal, 'https://backend.test/geocode/route-places', 'test-session'); }
(async () => {
  let count = 0;
  const cached = setup(async () => { count++; return ok(); });
  assert.equal((await load(cached))[0].name, 'Pueblo');
  await load(cached);
  assert.equal(count, 1);
  console.log('PASS successful lookup is cached for replay');

  for (const failure of [async () => ({ ok: false }), async () => { throw new TypeError('Network failure'); },
    async () => ok({ remark: 'timeout', elements: [] }), async () => ok({ invalid: true }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError('HTML response'); } })]) {
    const calls = [];
    const api = setup(async (url, options) => {
      calls.push(url);
      assert.equal(options.credentials, 'omit');
      assert.equal(url, 'https://backend.test/geocode/route-places');
      assert.equal(options.headers.Authorization, 'Bearer test-session');
      assert.ok(Array.isArray(JSON.parse(options.body).coordinates));
      assert.ok(!options.body.includes('test-session'));
      return calls.length === 1 ? failure() : ok();
    });
    await assert.rejects(load(api));
    assert.equal(calls.length, 1);
    assert.equal((await load(api))[0].name, 'Pueblo');
    assert.equal(calls.length, 2);
  }
  console.log('PASS HTTP, network, partial, malformed and non-JSON failures are not cached and never call providers from the browser');

  count = 0;
  const timeout = setup(async (_url, { signal }) => {
    count++;
    if (count === 2) return ok();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('Timed out'))));
  }, callback => setTimeout(callback, 5));
  await assert.rejects(load(timeout));
  assert.equal(count, 1);
  console.log('PASS a slow backend request is cancelled');

  count = 0;
  const controller = new AbortController();
  const cancelled = setup(async (_url, { signal }) => {
    count++;
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Cancelled')));
      controller.abort();
    });
  });
  await assert.rejects(load(cancelled, controller.signal));
  await assert.rejects(load(cancelled, controller.signal));
  assert.equal(count, 1);
  console.log('PASS leaving the viewer cancels without a backup request');

  count = 0;
  const retry = setup(async () => { count++; return count === 1 ? { ok: false } : ok(); });
  await assert.rejects(load(retry));
  assert.equal((await load(retry))[0].name, 'Pueblo');
  assert.equal(count, 2);
  console.log('PASS failures are not cached and reopening the route can recover');

  count = 0;
  const empty = setup(async () => { count++; return ok([]); });
  assert.equal((await load(empty)).length, 0);
  await load(empty);
  assert.equal(count, 1);
  console.log('PASS a valid empty area is cached without extra requests');
})().catch(error => { console.error(error); process.exitCode = 1; });
