import { Subject, of, throwError } from 'rxjs';
import { RouteComparisonComponent } from './route-comparison.component';
import { PlanTrack } from '../interfaces/plan';
import { RouteComparison } from '../interfaces/route-comparison';

describe('RouteComparisonComponent', () => {
  const tracks = [1, 2, 3].map(id => ({ id, folderId: 8, name: `Ruta ${id}` } as PlanTrack));
  let api: any, component: RouteComparisonComponent;
  const report: RouteComparison = { routes: [], aiStatus: 'unavailable', narrative: null };
  beforeEach(() => {
    api = { compare: jasmine.createSpy().and.returnValue(of(report)), get: jasmine.createSpy().and.returnValue(of(report)) };
    component = new RouteComparisonComponent(api, { current: 'es' } as any);
  });
  it('only requests a comparison for exactly two selected routes', () => {
    for (const count of [0, 1, 3]) { component.tracks = tracks.slice(0, count); component.compare(); }
    expect(api.compare).not.toHaveBeenCalled();
    component.tracks = tracks.slice(0, 2); component.compare();
    expect(api.compare).toHaveBeenCalledOnceWith([1, 2], 'es');
  });
  it('cancels an old request when the selection changes', () => {
    const response = new Subject<RouteComparison>(); api.compare.and.returnValue(response);
    component.tracks = tracks.slice(0, 2); component.ngOnChanges(); component.compare();
    component.tracks = tracks.slice(1, 3); component.ngOnChanges(); response.next(report);
    expect(component.report).toBeNull(); expect(component.loading).toBeFalse();
  });
  it('keeps the report when a parent rerenders the same selection', () => {
    component.tracks = tracks.slice(0, 2); component.ngOnChanges(); component.compare();
    component.tracks = tracks.slice(0, 2); component.ngOnChanges();
    expect(component.report).toBe(report);
  });
  it('invalidates the report if the same selected route has a new GPX', () => {
    component.tracks = tracks.slice(0, 2); component.ngOnChanges(); component.compare();
    component.tracks = [{ ...tracks[0], routeXml: '<gpx>changed</gpx>' }, tracks[1]]; component.ngOnChanges();
    expect(component.report).toBeNull();
  });
  it('does not send a second request while generating', () => {
    api.compare.and.returnValue(new Subject<RouteComparison>());
    component.tracks = tracks.slice(0, 2); component.compare(); component.compare();
    expect(api.compare).toHaveBeenCalledTimes(1); component.ngOnDestroy();
  });
  it('distinguishes a valid zero from missing data', () => {
    expect(component.value(0)).toBe('0'); expect(component.value(null)).toBe('Sin datos');
  });
  it('explains a monthly quota error', () => {
    api.compare.and.returnValue(throwError(() => ({ status: 402 })));
    component.tracks = tracks.slice(0, 2); component.compare();
    expect(component.error).toContain('límite'); expect(component.loading).toBeFalse();
  });
  it('reopens a saved report without generating or charging again', () => {
    component.openSaved(42);
    expect(api.get).toHaveBeenCalledOnceWith(42);
    expect(api.compare).not.toHaveBeenCalled();
    expect(component.report).toBe(report);
  });
});
