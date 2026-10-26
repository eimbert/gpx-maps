import { fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { convertToParamMap } from '@angular/router';
import { LoadGpxComponent } from './load-gpx.component';
import { RouteWorkspaceStateService } from '../services/route-workspace-state.service';
import { RouteAnalyzerComponent } from '../route-analyzer/route-analyzer.component';
import { parseProximityCoordinates } from '../utils/proximity-origin';
import { workspaceReturnUrl } from '../utils/workspace-return';

describe('Archive round-trip navigation', () => {
  let store: RouteWorkspaceStateService;
  let viewport: HTMLDivElement;
  const row = (id: number, province = 'Lleida'): any => ({
    trackId: id, routeId: null, eventName: `Ruta ${id}`, title: `Ruta ${id}`, province,
    population: 'Vielha', autonomousCommunity: 'Cataluña', year: 2026,
    startLat: 42.7, startLon: .8, distanceKm: 20, canDelete: true
  });

  function component(owner = 1): any {
    const router = {
      navigate: jasmine.createSpy('navigate').and.resolveTo(true),
      navigateByUrl: jasmine.createSpy('navigateByUrl').and.resolveTo(true),
      createUrlTree: (_: unknown, options: any) => ({
        toString: () => '/load?' + new URLSearchParams(Object.entries(options.queryParams)
          .filter(([, value]) => value !== null) as string[][]).toString()
      })
    };
    const instance: any = new LoadGpxComponent(
      { open: () => ({ afterClosed: () => of(undefined) }) } as any,
      router as any, {} as any,
      { getMyTracks: () => of([row(1), row(2)]), getSharedTracks: () => of([]) } as any,
      {} as any, { getSession: () => ({ id: owner }) } as any,
      { showMessage: jasmine.createSpy('showMessage') } as any,
      {} as any, {} as any, {} as any, store, { getUserId: () => owner } as any
    );
    instance.isAuthenticated = true;
    spyOn(instance, 'resolveDestinationDescription');
    spyOn(instance, 'toUserTrackRow').and.callFake((track: any) => track);
    return instance;
  }

  beforeEach(() => {
    store = new RouteWorkspaceStateService();
    viewport = document.createElement('div');
    viewport.className = 'route-workspace';
    viewport.style.cssText = 'height:100px; overflow:auto';
    const content = document.createElement('div');
    content.style.height = '3000px';
    viewport.appendChild(content);
    document.body.appendChild(viewport);
  });
  afterEach(() => viewport.remove());

  it('restores the tab, grouping, filter, open group and scroll after data reload', fakeAsync(() => {
    const first = component();
    first.routeView = 'archive';
    first.tableState.personal.groupBy = 'population';
    first.tableState.personal.filter = 'Vielha';
    first.selectedDestination = { province: 'Vielha', routes: [row(1)], count: 1 };
    viewport.scrollTop = 480;
    first.saveWorkspaceState();
    const returned = component();
    returned.routeView = 'archive';
    returned.restoreWorkspaceState();
    viewport.scrollTop = 0;
    returned.refreshUserTracks();
    tick();
    expect(returned.tableState.personal.groupBy).toBe('population');
    expect(returned.tableState.personal.filter).toBe('Vielha');
    expect(returned.selectedDestination.province).toBe('Vielha');
    expect(returned.selectedDestination.routes.length).toBe(2);
    expect(viewport.scrollTop).toBe(480);
  }));

  it('keeps proximity reference, road ranking and distances after refetching tracks', fakeAsync(() => {
    const first = component();
    first.routeView = 'archive';
    first.tableState.personal.groupBy = 'proximity';
    first.proximityOrigins.personal = { lat: 0, lon: 0, label: 'Referencia elegida' };
    first.userTrackRows.personal = [
      { ...row(1), proximityRank: 1, proximityMeters: 2500 },
      { ...row(2), proximityRank: 0, proximityMeters: 1500 }
    ];
    first.selectedDestination = { province: 'Ordenadas por proximidad' };
    first.saveWorkspaceState();
    const returned = component();
    returned.routeView = 'archive';
    returned.restoreWorkspaceState();
    returned.refreshUserTracks();
    tick();
    expect(returned.proximityOriginLabel).toBe('Referencia elegida');
    expect(returned.selectedDestination.routes.map((r: any) => r.trackId)).toEqual([2, 1]);
    expect(returned.selectedDestination.routes[0].proximityMeters).toBe(1500);
  }));

  it('keeps GPX from retired events in the personal archive', fakeAsync(() => {
    const page = component();
    page.eventService.getMyTracks = () => of([{ ...row(3), routeId: 42 }]);
    page.refreshUserTracks();
    tick();
    expect(page.getUserTrackRows('personal').map((track: any) => track.trackId)).toEqual([3]);
  }));

  it('opens the personal archive for a saved legacy events tab', () => {
    const first = component();
    first.activeUserTracksTab = 'events';
    first.saveWorkspaceState();
    const returned = component();
    returned.restoreWorkspaceState();
    expect(returned.activeUserTracksTab).toBe('personal');
  });

  it('ignores an old events mode link', () => {
    const page = component();
    page.route.snapshot = { data: {}, queryParamMap: convertToParamMap({ mode: 'events' }) };
    page.applyInitialMode();
    expect(page.mode).toBe('routes');
  });

  it('returns to the picker even when a discovery track is already loaded', () => {
    const page = component();
    page.animationType = 'descubrir';
    page.tracks = [{}];
    page.archiveReturn = 'picker';
    page.goBack();
    expect(page.choosingFromArchive).toBeTrue();
    expect(page.router.navigate).toHaveBeenCalled();
  });

  it('uses the current archive instead of an older animation picker as return destination', () => {
    const page = component();
    page.routeView = 'archive';
    page.archiveReturn = 'picker';
    expect(page.workspaceReturnUrl()).toBe('/load?mode=routes&view=archive');
  });

  it('preserves the current group when the proximity dialog is cancelled', async () => {
    const page = component();
    page.selectedDestination = { province: 'Lleida' };
    spyOn(page, 'resolveCurrentPosition');
    await page.enableProximityGroupingForActiveTab();
    expect(page.userTracksGroupBy).toBe('province');
    expect(page.selectedDestination.province).toBe('Lleida');
    expect(page.resolveCurrentPosition).not.toHaveBeenCalled();
  });

  it('sorts from explicit coordinates without requesting device location', async () => {
    const page = component();
    page.userTrackRows.personal = [row(1), { ...row(2), startLat: 0, startLon: 0 }];
    page.dialog.open = () => ({ afterClosed: () => of({ lat: 0, lon: 0, label: 'Origen elegido' }) });
    spyOn(page, 'resolveCurrentPosition');
    spyOn(page, 'refineTopProximityRowsWithMatrix').and.resolveTo();
    await page.enableProximityGroupingForActiveTab();
    expect(page.resolveCurrentPosition).not.toHaveBeenCalled();
    expect(page.userTracksGroupBy).toBe('proximity');
    expect(page.groupedUserTracks[0].routes[0].trackId).toBe(2);
  });

  it('keeps the current grouping when geolocation permission is denied', async () => {
    const page = component();
    page.dialog.open = () => ({ afterClosed: () => of('current') });
    spyOn(page, 'resolveCurrentPosition').and.rejectWith(new Error('Permission denied'));
    await page.enableProximityGroupingForActiveTab();
    expect(page.userTracksGroupBy).toBe('province');
    expect(page.isActiveUserTracksProximityLoading).toBeFalse();
    expect(page.infoMessageService.showMessage).toHaveBeenCalled();
  });

  it('does not restore another account’s workspace', () => {
    const first = component();
    first.tableState.personal.filter = 'Privado';
    first.saveWorkspaceState();
    const second = component(2);
    second.restoreWorkspaceState();
    expect(second.tableState.personal.filter).toBe('');
  });

  it('returns from analysis to the archive or the originating plan folder', () => {
    const router = { navigateByUrl: jasmine.createSpy(), navigate: jasmine.createSpy() };
    const route: any = { snapshot: { queryParamMap: convertToParamMap({ returnTo: '/load?view=archive' }) } };
    const analyzer = new RouteAnalyzerComponent(route, router as any, {} as any, {} as any, {} as any, {} as any);
    analyzer.goBack();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/load?view=archive');
    route.snapshot.queryParamMap = convertToParamMap({ source: 'plan', folderId: '12' });
    analyzer.goBack();
    expect(router.navigate).toHaveBeenCalledWith(['/plan'], { queryParams: { folderId: '12' } });
  });
});

describe('Proximity coordinate input and internal return URLs', () => {
  it('accepts copied decimal coordinates, zero and valid boundaries', () => {
    expect(parseProximityCoordinates(' 41.40338, 2.17403 ')?.lat).toBe(41.40338);
    expect(parseProximityCoordinates('0, 0')?.lon).toBe(0);
    expect(parseProximityCoordinates('-90, +180')?.lat).toBe(-90);
  });
  it('rejects ambiguous decimal commas, swapped out-of-range values and invalid input', () => {
    ['41,40338,2,17403', '91, 0', '0, -181', '', 'Madrid', 'NaN, 2'].forEach(value => {
      expect(parseProximityCoordinates(value)).withContext(value).toBeNull();
    });
  });
  it('only accepts supported internal screens', () => {
    expect(workspaceReturnUrl('/load?view=archive&picker=1')).not.toBeNull();
    expect(workspaceReturnUrl('/plan?folderId=12')).not.toBeNull();
    ['//example.com', 'https://example.com', '/load/other', '/other'].forEach(value => expect(workspaceReturnUrl(value)).toBeNull());
  });
});
