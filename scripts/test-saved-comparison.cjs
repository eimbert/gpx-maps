// Saved reports must load independently of the Tracks tab and its selection.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { Subject } = require('rxjs');
const source = fs.readFileSync('src/app/route-comparison/route-comparison.component.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true
}});
const decorator = () => () => {};
const context = { exports: {}, require: name => {
  if (name === '@angular/core') return { Component: decorator, Input: decorator, Output: decorator,
    ViewChild: decorator, EventEmitter: class { emit() {} } };
  return {};
}};
vm.runInNewContext(compiled.outputText, context);
const pending = new Map();
const requests = [];
const component = new context.exports.RouteComparisonComponent({ get(id) {
  requests.push(id);
  const result = new Subject(); pending.set(id, result); return result;
}}, { current: 'es' });
component.savedOnly = true;
component.savedReportId = 17;
component.ngOnChanges({ savedReportId: { currentValue: 17, firstChange: true } });
assert.deepEqual(requests, [17]);
assert.equal(component.loading, true);
// An empty selection is normal in Informes; it must not cancel the request.
component.ngOnChanges({ tracks: { currentValue: [] } });
const report = { id: 17, routes: [], narrative: null, aiStatus: 'generated' };
pending.get(17).next(report);
assert.equal(component.report, report);
assert.equal(component.expanded, true);
assert.equal(component.loading, false);
component.savedReportId = 18;
component.ngOnChanges({ savedReportId: { currentValue: 18 } });
pending.get(17).next(report);
assert.equal(component.report, null);
pending.get(18).error({ status: 404 });
assert.equal(component.loading, false);
assert.match(component.error, /no est.*disponible/);
component.ngOnDestroy();
console.log('PASS: saved report loads without selected tracks, ignores stale responses and exposes errors.');
