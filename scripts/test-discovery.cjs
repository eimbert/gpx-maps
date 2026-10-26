// Run with node scripts/test-discovery.cjs. No network or browser required.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/discovery-route.ts'), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
}).outputText, context);
const { prepareDiscoveryRoute, sampleDiscoveryRoute, angleDelta, routeBearing, discoveryTimeline,
  discoveryHeadingAt, advanceDiscoveryHeading, discoveryFlightFraming, discoveryDuration,
  advanceDiscoveryElevation, discoveryFrameSeconds } = context.exports;
const placesContext = { exports: {}, require: () => context.exports };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/utils/discovery-places.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
}).outputText, placesContext);
const { discoveryPlacesQuery, parseDiscoveryPlaces, nearbyDiscoveryPlace } = placesContext.exports;
let checks = 0;
function check(name, test) { test(); checks++; console.log(`PASS ${name}`); }
const points = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0, lon: 0.01 }];
check('normal playback has the same pace at 15, 30, 60 and 120 fps', () => {
  for (const fps of [15, 30, 60, 120]) {
    let elapsed = 0;
    for (let i = 0; i < fps * 10; i++) elapsed += discoveryFrameSeconds(1 / fps);
    assert.ok(Math.abs(elapsed - 10) < 1e-9);
  }
});
check('stalled frames do not skip sections of the route or accumulate catch-up debt', () => {
  for (const stall of [0.5, 2, 10]) {
    assert.ok(discoveryFrameSeconds(stall) <= 1 / 15);
    assert.equal(discoveryFrameSeconds(1 / 60), 1 / 60);
  }
  for (const invalid of [NaN, Infinity, -1]) assert.equal(discoveryFrameSeconds(invalid), 0);
});
check('late DEM tiles change camera elevation gradually at different frame rates', () => {
  const results = [];
  for (const fps of [15, 30, 60, 120]) {
    let height = 100;
    for (let i = 0; i < fps * 12; i++) {
      const next = advanceDiscoveryElevation(height, 400, 1 / fps);
      assert.ok(next >= height && next - height <= 60 / fps + 1e-9);
      height = next;
    }
    assert.ok(Math.abs(height - 400) < 0.02);
    results.push(height);
  }
  assert.ok(Math.max(...results) - Math.min(...results) < 0.01);
});
check('alternating DEM levels cannot shake the whole camera by their raw amplitude', () => {
  let height = 300;
  for (let i = 0; i < 600; i++) {
    const next = advanceDiscoveryElevation(height, i % 2 ? 340 : 260, 1 / 60);
    assert.ok(Math.abs(next - height) <= 1);
    assert.ok(Math.abs(next - 300) < 1);
    height = next;
  }
});
check('missing elevation holds position, sea level and negative elevations remain valid', () => {
  for (const missing of [null, NaN, Infinity]) assert.equal(advanceDiscoveryElevation(300, missing, 1 / 60), 300);
  assert.equal(advanceDiscoveryElevation(300, 600, 0), 300);
  assert.ok(advanceDiscoveryElevation(300, 600, 5) <= 304);
  let height = 300;
  for (let i = 0; i < 1200; i++) height = advanceDiscoveryElevation(height, 0, 1 / 60);
  assert.ok(Math.abs(height) < 0.01);
  for (let i = 0; i < 1200; i++) height = advanceDiscoveryElevation(height, -50, 1 / 60);
  assert.ok(Math.abs(height + 50) < 0.01);
});
check('short routes retain a minute and invalid distances have a safe fallback', () => {
  for (const distance of [0, 1, 5000, 10000, -1, NaN, Infinity]) {
    assert.equal(discoveryDuration(distance), 60);
  }
});
check('long tracks keep a bounded travel speed even beyond the old duration limits', () => {
  let previous = 60;
  for (const distance of [10001, 20000, 50000, 100000, 1000000]) {
    const duration = discoveryDuration(distance);
    assert.ok(Number.isInteger(duration) && duration >= previous);
    const traveledInOneSecond = distance * discoveryTimeline(4, duration).progress;
    assert.ok(traveledInOneSecond <= 10000 / 53 + 1e-9);
    assert.ok(traveledInOneSecond > 185);
    previous = duration;
  }
  assert.equal(discoveryDuration(20000), 113);
  assert.equal(discoveryDuration(50000), 272);
  assert.equal(discoveryDuration(100000), 537);
});
check('double speed covers twice the distance while preserving intro and outro', () => {
  for (const distance of [1000, 10000, 20000, 50000, 1000000]) {
    const normal = discoveryDuration(distance, 1);
    const fast = discoveryDuration(distance, 2);
    const normalProgress = discoveryTimeline(8, normal).progress;
    assert.equal(discoveryTimeline(8, fast).progress, normalProgress * 2);
    assert.equal(discoveryTimeline(2, fast).phase, 'intro');
    assert.equal(discoveryTimeline(fast - 4, fast).progress, 1);
    assert.equal(discoveryTimeline(fast, fast).transition, 1);
    assert.equal(discoveryDuration(distance, undefined), normal);
    assert.equal(discoveryDuration(distance, 99), normal);
  }
});
check('uneven point spacing still moves by distance', () => {
  const route = prepareDiscoveryRoute(points);
  assert.ok(Math.abs(sampleDiscoveryRoute(route, route.total / 2).lon - 0.005) < 1e-9);
});
check('timestamps and pauses never reorder or change the route', () => {
  const a = prepareDiscoveryRoute(points);
  const b = prepareDiscoveryRoute(points.map((p, i) => ({ ...p, time: [90000, 0, 86400000][i] })));
  assert.deepEqual(a, b);
});
check('duplicate and invalid points do not cause division by zero', () => {
  const route = prepareDiscoveryRoute([points[0], points[0], { lat: NaN, lon: 1 }, { lat: 91, lon: 0 }, points[2]]);
  assert.equal(route.points.length, 2);
  assert.ok(Number.isFinite(sampleDiscoveryRoute(route, 0).lon));
  assert.equal(prepareDiscoveryRoute([points[0], points[0]]).total, 0);
});
check('interpolation clamps to endpoints', () => {
  const route = prepareDiscoveryRoute(points);
  assert.equal(sampleDiscoveryRoute(route, -50).lon, 0);
  assert.equal(sampleDiscoveryRoute(route, route.total + 50).lon, 0.01);
});
check('date line crossing stays local', () => {
  const route = prepareDiscoveryRoute([{ lat: 0, lon: 179.9 }, { lat: 0, lon: -179.9 }]);
  assert.ok(route.total < 23000);
  assert.ok(Math.abs(sampleDiscoveryRoute(route, route.total / 2).lon - 180) < 1e-9);
});
check('camera rotation takes shortest direction across north', () => {
  assert.equal(angleDelta(359, 1), 2);
  assert.equal(angleDelta(1, 359), -2);
  assert.equal(routeBearing({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 0);
});
check('all durations include intro and final overview with a complete route', () => {
  for (const duration of [30, 60, 90, discoveryDuration(50000), discoveryDuration(1000000)]) {
    assert.equal(discoveryTimeline(0, duration).phase, 'intro');
    assert.equal(discoveryTimeline(3, duration).progress, 0);
    assert.equal(discoveryTimeline(3 + (duration - 7) / 2, duration).progress, 0.5);
    assert.equal(discoveryTimeline(duration - 4, duration).phase, 'outro');
    assert.equal(discoveryTimeline(duration - 4, duration).progress, 1);
    assert.equal(discoveryTimeline(duration, duration).transition, 1);
  }
});
check('large tracks do not overflow and can be sampled', () => {
  const route = prepareDiscoveryRoute(Array.from({ length: 160000 }, (_, i) => ({ lat: 42, lon: i / 1000000 })));
  assert.ok(Number.isFinite(sampleDiscoveryRoute(route, route.total * 0.75).lon));
});
const heading = bearing => ({ bearing, target: bearing, candidate: null, candidateSeconds: 0 });
check('small alternating bends leave the camera direction unchanged', () => {
  let state = heading(0);
  for (let i = 0; i < 600; i++) state = advanceDiscoveryHeading(state, Math.sin(i / 12) * 15, 1 / 60);
  assert.equal(state.bearing, 0);
});
check('brief sharp bends do not trigger a camera turn', () => {
  let state = heading(0);
  for (let i = 0; i < 30; i++) state = advanceDiscoveryHeading(state, 90, 1 / 60);
  state = advanceDiscoveryHeading(state, 0, 1 / 60);
  assert.equal(state.bearing, 0);
});
check('sustained major direction changes turn slowly at both 30 and 60 fps', () => {
  const results = [];
  for (const fps of [30, 60]) {
    let state = heading(0);
    for (let i = 0; i < fps * 15; i++) {
      const previous = state.bearing;
      state = advanceDiscoveryHeading(state, 90, 1 / fps);
      assert.ok(Math.abs(state.bearing - previous) <= 18 / fps + 1e-10);
    }
    assert.ok(state.bearing > 89 && state.bearing <= 90);
    results.push(state.bearing);
  }
  assert.ok(Math.abs(results[0] - results[1]) < 0.1);
});
check('camera does not turn around when direction crosses north', () => {
  let state = heading(350);
  for (let i = 0; i < 900; i++) state = advanceDiscoveryHeading(state, 40, 1 / 60);
  assert.ok(state.bearing > 399 && state.bearing <= 400);
});
check('sustained moderate turns now reorient the camera without chasing small bends', () => {
  let state = heading(0);
  for (let i = 0; i < 60; i++) state = advanceDiscoveryHeading(state, 25, 1 / 60);
  assert.equal(state.target, 25);
  assert.ok(state.bearing > 0 && state.bearing < 18);
  const target = state.target;
  for (let i = 0; i < 600; i++) state = advanceDiscoveryHeading(state, 25 + Math.sin(i / 12) * 15, 1 / 60);
  assert.equal(state.target, target);
});
check('a closed local loop holds direction instead of choosing an arbitrary bearing', () => {
  const deg = 180 / (Math.PI * 6371000);
  const loop = prepareDiscoveryRoute([[0, 0], [1000, 0], [1000, 25], [1025, 25], [1025, 0], [1000, 0], [0, 0]]
    .map(([north, east]) => ({ lat: north * deg, lon: east * deg })));
  const state = advanceDiscoveryHeading(heading(75), null, 1);
  assert.equal(state.bearing, 75);
  assert.equal(discoveryHeadingAt(prepareDiscoveryRoute([{ lat: 0, lon: 0 }]), 0, 60), null);
  assert.equal(discoveryHeadingAt(loop, (loop.distances[1] + loop.distances[5]) / 2, 90), null);
});
check('route direction averages repeated small zigzags', () => {
  const zigzag = prepareDiscoveryRoute(Array.from({ length: 201 }, (_, i) => ({ lat: i * 0.00005, lon: Math.sin(i * Math.PI / 4) * 0.00001 })));
  for (const ratio of [0.2, 0.4, 0.6, 0.8]) {
    assert.ok(Math.abs(discoveryHeadingAt(zigzag, zigzag.total * ratio, 60)) < 5);
  }
});
check('mobile framing magnifies the route without flattening the terrain', () => {
  const route = prepareDiscoveryRoute([{ lat: 42, lon: 2 }, { lat: 42.3, lon: 2 }]);
  const mobile = discoveryFlightFraming(route, 30, 390);
  const previousZoom = Math.log2(78271 * Math.cos(42 * Math.PI / 180) * 390 / (route.total / 23 * 7)) - 0.3;
  assert.ok(mobile.zoom >= previousZoom + 1);
  assert.ok(mobile.pitch >= 45 && mobile.pitch < 50);
  const desktop = discoveryFlightFraming(route, 60, 1440);
  const previousDesktop = Math.log2(78271 * Math.cos(42 * Math.PI / 180) * 1440 / (route.total / 53 * 7)) - 0.3;
  assert.ok(Math.abs(desktop.zoom - previousDesktop) < 1e-9);
  assert.equal(desktop.pitch, 50);
  assert.ok(discoveryFlightFraming(prepareDiscoveryRoute(points), 90, 390).zoom <= 15.7);
});
check('camera presets preserve the default and offer a closer flight across screen sizes and durations', () => {
  const routes = [prepareDiscoveryRoute(points), prepareDiscoveryRoute([{ lat: 42, lon: 2 }, { lat: 42.3, lon: 2 }])];
  for (const route of routes) for (const width of [320, 390, 768, 1440]) for (const duration of [30, 60, 90]) {
    const current = discoveryFlightFraming(route, duration, width, 'actual');
    assert.deepEqual(discoveryFlightFraming(route, duration, width), current);
    assert.deepEqual(discoveryFlightFraming(route, duration, width, 'invalid-old-value'), current);
    const closer = discoveryFlightFraming(route, duration, width, 'cercana');
    assert.ok(closer.zoom > current.zoom && closer.zoom <= 16.7);
    assert.ok(closer.zoom - current.zoom >= 0.74 && closer.zoom - current.zoom <= 1.01);
    assert.equal(closer.pitch, current.pitch);
  }
});
check('place queries stay bounded even for long tracks and wrap longitude', () => {
  const query = discoveryPlacesQuery(prepareDiscoveryRoute([{ lat: 0, lon: 179.9 }, { lat: 0, lon: -179.9 }]));
  assert.ok(query.includes('-179.9'));
  assert.ok(!query.includes('180.1'));
  const long = discoveryPlacesQuery(prepareDiscoveryRoute([{ lat: 0, lon: 0 }, { lat: 70, lon: 0 }]));
  assert.ok(long.length < 5000);
  assert.ok(JSON.parse(long).coordinates.length <= 161);
  assert.ok(JSON.parse(long).buffer <= 3000);
});
check('place data ignores malformed coordinates and unrelated features', () => {
  const valid = { id: 'village-1', lat: 0, lon: 0, name: ' Pueblo ', radius: 700 };
  const places = parseDiscoveryPlaces([valid, { ...valid, lat: 91 }, { ...valid, lon: '0' },
    { ...valid, radius: 999 }, { ...valid, name: ' ' }, null]);
  assert.equal(places.length, 1);
  assert.equal(places[0].name, 'Pueblo');
  assert.equal(parseDiscoveryPlaces({}).length, 0);
});
const village = { id: 1, name: 'Pueblo', lat: 0, lon: 0, radius: 700 };
check('town label appears nearby and disappears in the mountains', () => {
  assert.equal(nearbyDiscoveryPlace([village], { lat: 0, lon: 0.003 }, null), village);
  assert.equal(nearbyDiscoveryPlace([village], { lat: 0, lon: 0.02 }, village), null);
});
check('neighbouring villages do not flicker at the distance boundary', () => {
  const other = { ...village, id: 2, lon: 0.008 };
  assert.equal(nearbyDiscoveryPlace([village, other], { lat: 0, lon: 0.0042 }, village), village);
  assert.equal(nearbyDiscoveryPlace([village, other], { lat: 0, lon: 0.007 }, village), other);
});
check('a circular route can highlight a population again on its return', () => {
  let current = nearbyDiscoveryPlace([village], { lat: 0, lon: 0 }, null);
  current = nearbyDiscoveryPlace([village], { lat: 0, lon: 0.02 }, current);
  assert.equal(current, null);
  assert.equal(nearbyDiscoveryPlace([village], { lat: 0, lon: 0 }, current), village);
});
console.log(`Passed ${checks} discovery regressions.`);
