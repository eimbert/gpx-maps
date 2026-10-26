// Numerical regressions and language-parity fixtures. No browser or application server required.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/gpx-elevation.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } });
const context = { exports: {} };
vm.runInNewContext(compiled.outputText, context);
const { calculateElevation } = context.exports;
const metersToDegrees = 180 / (Math.PI * 6371000);
const route = (count, step, altitude, segment = 0) => Array.from({ length: count }, (_, i) => ({
  lat: 0, lon: i * step * metersToDegrees, ele: altitude(i * step, i), segment
}));
const fixtures = [];
function check(name, points, verify) {
  const result = calculateElevation(points);
  verify(result);
  assert.ok(result.gain === null || Number.isInteger(result.gain));
  assert.ok(result.loss === null || Number.isInteger(result.loss));
  fixtures.push({ name, points, expected: { gain: result.gain, loss: result.loss, status: result.status,
    distanceKm: result.distanceKm, min: result.min, max: result.max, quality: result.quality, qualityMetrics: result.qualityMetrics } });
  console.log(`${name}: D+ ${result.gain}, D- ${result.loss}, ${result.status}`);
  return result;
}
check('flat sea level is valid', route(101, 10, () => 0), r => { assert.equal(r.gain, 0); assert.equal(r.status, 'ok'); });
check('flat GPS noise', route(1001, 2, (_, i) => 100 + Math.sin(i * 2.1) * 1.5), r => assert.ok(r.gain <= 3));
check('high frequency noise cannot alias into hills', route(10001, 1, d => 100 + 7 * Math.sin(d * 2 * Math.PI / 10.3)), r => assert.ok(r.gain <= 10));
const gentle = check('gentle long climb', route(2001, 5, d => 100 + d * 0.01), r => { assert.equal(r.gain, 100); assert.equal(r.loss, 0); });
const sparse = check('same climb sparse sampling', route(101, 100, d => 100 + d * 0.01), r => assert.equal(r.gain, gentle.gain));
check('pure descent never creates ascent', route(101, 10, d => 200 - d * 0.1), r => { assert.equal(r.gain, 0); assert.equal(r.loss, 100); });
check('climb and descent', route(401, 5, d => 100 + (d < 1000 ? d : 2000 - d) * 0.1), r => { assert.ok(Math.abs(r.gain - 100) <= 2); assert.ok(Math.abs(r.loss - 100) <= 2); });
check('isolated altitude spike', route(101, 10, (_, i) => i === 50 ? 850 : 100), r => { assert.equal(r.gain, 0); assert.equal(r.loss, 0); });
check('no elevation is unavailable', route(101, 10, () => null), r => { assert.equal(r.gain, null); assert.equal(r.status, 'unavailable'); });
check('missing altitude breaks the run', route(101, 10, (_, i) => i === 50 ? null : i < 50 ? 100 : 800), r => { assert.equal(r.gain, 0); assert.equal(r.status, 'partial'); });
check('track segment boundaries never add ascent', [...route(51, 10, () => 100), ...route(51, 10, () => 1000, 1)], r => { assert.equal(r.gain, 0); assert.ok(Math.abs(r.distanceKm - 1) < 1e-9); });
check('stationary drift', route(1001, 0, (_, i) => 100 + i), r => assert.equal(r.gain, null));
check('subthreshold ripples', route(1001, 10, (d) => 100 + Math.sin(d / 100) * 1.5), r => assert.equal(r.gain, 0));
const valley = check('initial small dip must not hide following climb', route(3, 100, (_, i) => [100, 96, 102][i]), r => assert.equal(r.gain, 6));
check('initial small dip reversed is symmetric', route(3, 100, (_, i) => [102, 96, 100][i]), r => assert.equal(r.loss, valley.gain));
check('repeated six meter climbs', route(7, 200, (_, i) => [100, 96, 102, 96, 102, 96, 102][i]), r => assert.ok(r.gain >= 16));
check('real repeated hills', route(401, 5, d => 100 + 20 * (1 - Math.cos(d * Math.PI / 250))), r => { assert.ok(r.gain >= 155 && r.gain <= 160); });
check('negative altitudes are valid', route(101, 10, d => -100 + d * 0.05), r => assert.equal(r.gain, 50));
check('out of range altitude is missing', route(101, 10, (_, i) => i === 50 ? 99999 : 100), r => { assert.equal(r.gain, 0); assert.equal(r.status, 'partial'); });
check('invalid coordinates break the run', [{ lat: NaN, lon: 0, ele: 100, segment: 0 }, ...route(101, 10, () => 100)], r => { assert.equal(r.gain, 0); assert.equal(r.status, 'partial'); });
check('large GPX avoids argument-stack overflow', route(160000, 1, d => 100 + d * 0.001), r => assert.equal(r.gain, 160));
check('A stable detailed climb', route(1001, 5, d => 100 + d * 0.05), r => { assert.equal(r.quality, 'A'); assert.equal(r.gain, 250); });
check('B sparse clean climb is not certified A', route(51, 100, d => 100 + d * 0.05), r => { assert.equal(r.quality, 'B'); assert.equal(r.gain, 250); });
check('B low amplitude oscillation keeps normal filtering', route(1001, 10, d => 100 + 1.5 * Math.sin(d / 100)), r => { assert.equal(r.quality, 'B'); assert.equal(r.gain, 0); });
check('C strong rapid noise keeps flat route flat', route(10001, 1, d => 100 + 7 * Math.sin(d * 2 * Math.PI / 10.3)), r => { assert.equal(r.quality, 'C'); assert.ok(r.gain <= 10); });
check('C incomplete profile does not fill missing samples', route(101, 10, (_, i) => i % 5 === 0 ? null : 100), r => { assert.equal(r.quality, 'C'); assert.equal(r.gain, 0); assert.equal(r.status, 'partial'); });
check('unavailable altitude has no grade', route(101, 10, () => null), r => assert.equal(r.quality, null));
check('many tiny segments cannot masquerade as detailed A', Array.from({length:20}, (_,i) => route(2, 100, () => 100+i, i)).flat(), r => { assert.equal(r.quality, 'B'); assert.equal(r.gain, 0); });
for (const spacing of [1, 5, 20]) {
  check(`stable rolling terrain at ${spacing} m spacing`, route(10000 / spacing + 1, spacing, d => 100 + 25 * (1 - Math.cos(d * Math.PI / 500))), r => {
    assert.equal(r.quality, 'A'); assert.ok(r.gain >= 495 && r.gain <= 500);
  });
}
for (const spacing of [1, 5, 20]) {
  check(`correlated noise over two real hills at ${spacing} m spacing`,
    route(10000 / spacing + 1, spacing, d => 100 + 100 * (1 - Math.cos(d * Math.PI / 2500))
      + 2 * Math.sin(d * 2 * Math.PI / 130) + 0.7 * Math.sin(d * 2 * Math.PI / 35)), r => {
      assert.equal(r.quality, 'C');
      assert.ok(Math.abs(r.gain - 400) <= 5, 'preserve the two 200 m climbs, discard correlated noise');
    });
  check(`genuine short six meter hills at ${spacing} m spacing`,
    route(10000 / spacing + 1, spacing, d => 100 + 3 * (1 - Math.cos(d * Math.PI / 100))), r => {
      assert.equal(r.quality, 'A');
      assert.ok(r.gain >= 285 && r.gain <= 300, 'retain at least 95% of real hills, allowing for sparse interpolation');
    });
}
// Encode fixtures as genuine GPX to also exercise the independent XML parsers in parity tests.
function toGpx(points) {
  let segment, body = '';
  for (const p of points) {
    if (segment !== p.segment) { if (segment !== undefined) body += '</trkseg>'; body += '<trkseg>'; segment = p.segment; }
    body += `<trkpt lat="${p.lat}" lon="${p.lon}">${p.ele === null ? '' : `<ele>${p.ele}</ele>`}</trkpt>`;
  }
  if (segment !== undefined) body += '</trkseg>';
  return `<gpx xmlns="http://www.topografix.com/GPX/1/1"><metadata><extensions><totalascent>9999</totalascent></extensions></metadata><trk>${body}</trk></gpx>`;
}
if (process.argv[2]) {
  const output = fixtures.map(({ name, points, expected }) => ({ name, xml: toGpx(points), expected }));
  fs.writeFileSync(path.resolve(process.argv[2]), JSON.stringify(output));
}
console.log(`Passed ${fixtures.length} elevation regressions.`);
