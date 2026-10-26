import { of, Subject } from 'rxjs';
import { LoadGpxComponent } from '../load-gpx/load-gpx.component';
import { PlanOutingComponent } from '../plan-outing/plan-outing.component';
import { RouteAnalyzerComponent } from '../route-analyzer/route-analyzer.component';
import { RouteAnalysis } from '../interfaces/route-analysis';
import { GpxImportService } from '../services/gpx-import.service';
import { RouteAnalysisService } from '../services/route-analysis.service';
import { DiscoverRouteComponent } from '../discover-route/discover-route.component';
import { MapComponent } from '../map/map.component';
import { calculateGpxElevation } from './gpx-elevation';
import { selectedUiText } from '../services/screen-texts';

describe('Shared elevation through the three GPX entry paths', () => {
  const gpx = (elevations: Array<number | null>, pointName = 'trkpt', prefix = '') => {
    const points = elevations.map((ele, i) => `<${prefix}${pointName} lat="41" lon="${2 + i * .001}">${ele === null ? '' : `<${prefix}ele>${ele}</${prefix}ele>`}</${prefix}${pointName}>`).join('');
    const body = pointName === 'rtept' ? `<${prefix}rte>${points}</${prefix}rte>` : `<${prefix}trk><${prefix}trkseg>${points}</${prefix}trkseg></${prefix}trk>`;
    return `<${prefix}gpx ${prefix ? 'xmlns:g' : 'xmlns'}="http://www.topografix.com/GPX/1/1"><${prefix}metadata><${prefix}ascent>9999</${prefix}ascent></${prefix}metadata>${body}</${prefix}gpx>`;
  };

  const savedAnalysis = (): RouteAnalysis => ({
    model: 'cached', fallbackReason: 'Informe anterior: el desnivel actual se ha recalculado.',
    report: { summary: 'Informe guardado', routeType: 'mixta', difficultyExplanation: '', highlights: [], warnings: [], recommendations: [] },
    routeStats: { distanceKm: 999, elevationGainM: 9999, elevationLossM: 8888, minEleM: 0, maxEleM: 9999,
      elevationProfile: [{ distanceKm: 0, elevationM: 0 }, { distanceKm: 999, elevationM: 9999 }] }
  });

  function analyzer(service: any = { lookupExisting: () => of(null) }): RouteAnalyzerComponent {
    return new RouteAnalyzerComponent({} as any, {} as any, {} as any, service, { getEntitlements: () => of(null) } as any, {} as any);
  }

  async function allPaths(xml: string) {
    // Instantiate the GPX parsing path without dialogs, geocoding, persistence or a session.
    const load: any = Object.create(LoadGpxComponent.prototype);
    const loaded = load.parseGpxData(xml, 'route.gpx', 0).track;
    // 3D and the map must retain the original calculation, including gaps/segments.
    const expected = calculateGpxElevation(xml);
    const discovery: any = Object.create(DiscoverRouteComponent.prototype);
    discovery.router = { getCurrentNavigation: () => ({ extras: { state: { gpxViewerPayload: {
      tipoAnimacion: 'descubrir', routeXml: loaded.data.routeXml,
      tracks: [{ trkpts: loaded.data.trkpts }], mostrarPerfil: true
    } } } }) };
    discovery.transfer = { clear: () => {} };
    discovery.readPayload();
    expect(discovery.gain).toBe(expected.gain);
    expect(discovery.elevationQuality).toBe(expected.quality);
    const map: any = Object.create(MapComponent.prototype);
    map.trackMetas = [{ raw: loaded.data.trkpts }];
    map.profileTrackIndex = 0;
    map.originalRouteXml = xml;
    map.editDirty = false;
    expect(map.editorAscentLabel).toBe(expected.gain === null ? '—' : `${expected.gain} m`);
    expect(map.editorElevationQuality).toBe(expected.quality);
    const imports = new GpxImportService({} as any);
    spyOn(imports, 'readFileAsText').and.returnValue(Promise.resolve(xml));
    spyOn(imports, 'resolveTrackLocationFromGpx').and.returnValue(Promise.resolve({
      startLatitude: 41, startLongitude: 2, population: null, autonomousCommunity: null, comarca: null, province: null
    }));
    const plan: any = Object.create(PlanOutingComponent.prototype);
    plan.gpxImportService = imports;
    plan.userId = 1;
    const planned = await plan.buildTrackImportPayload(1, new File([xml], 'route.gpx'));
    const analyzed = analyzer();
    (analyzed as any).loadRouteXml(xml, 'route.gpx', null, 'upload');
    return { loaded, planned, analyzed, plan };
  }

  it('uses identical totals in animation, planning and analyzer, ignoring ascent metadata', async () => {
    const { loaded, planned, analyzed } = await allPaths(gpx([100, 120, 140, 160, 180, 200]));
    expect(loaded.details.ascent).toBe(100);
    expect(planned.desnivel).toBe(loaded.details.ascent);
    expect(analyzed.stats?.elevationGain).toBe(loaded.details.ascent);
    expect(planned.distance_km).toBe(loaded.details.distance);
    expect(analyzed.stats?.distanceKm).toBe(loaded.details.distance);
  });

  it('keeps missing altitude unavailable rather than reporting zero ascent', async () => {
    const { loaded, planned, analyzed, plan } = await allPaths(gpx([null, null, null]));
    expect(Number.isNaN(loaded.details.ascent)).toBeTrue();
    expect(loaded.details.elevationStatus).toBe('unavailable');
    expect(planned.desnivel).toBeNull();
    expect(plan.formatDesnivel(planned.desnivel)).toBe(selectedUiText('noElevation'));
    expect(analyzed.stats?.elevationGain).toBeNull();
    expect((analyzed as any).elevationResult.status).toBe('unavailable');
    expect(analyzed.elevationSourceLabel).toBeTruthy();
    expect(analyzed.profilePath).toBe('');
    expect(analyzed.trackPath).not.toBe('');
  });

  it('accepts route points with a namespace prefix in all entry paths', async () => {
    const { loaded, planned, analyzed } = await allPaths(gpx([100, 150, 200], 'rtept', 'g:'));
    expect(loaded.details.ascent).toBe(100);
    expect(planned.desnivel).toBe(100);
    expect(analyzed.stats?.elevationGain).toBe(100);
  });

  it('retains gaps in partial profiles and never joins an altitude jump across missing data', async () => {
    const { loaded, planned, analyzed } = await allPaths(gpx([100, 100, null, 900, 900]));
    expect(loaded.details.elevationStatus).toBe('partial');
    expect(planned.desnivel).toBe(0);
    expect(analyzed.stats?.elevationGain).toBe(0);
    expect((analyzed as any).elevationResult.status).toBe('partial');
    expect(analyzed.elevationSourceLabel).toBeTruthy();
    expect((analyzed.profilePath.match(/M /g) ?? []).length).toBe(2);
    expect(Number.isNaN(loaded.data.trkpts[2].ele)).toBeTrue();
  });

  it('keeps separate segments through animation and map navigation', async () => {
    const xml = gpx([100, 100, 900, 900]).replace('<trkpt lat="41" lon="2.002">',
      '</trkseg><trkseg><trkpt lat="41" lon="2.002">');
    const { loaded, analyzed } = await allPaths(xml);
    expect(loaded.details.ascent).toBe(0);
    expect(analyzed.stats?.elevationGain).toBe(0);
    expect(loaded.data.trkpts.map((p: any) => p.segment)).toEqual([0, 0, 1, 1]);
  });

  it('reuses a saved report without letting its old routeStats overwrite current GPX totals', () => {
    const cached = savedAnalysis();
    const component = analyzer({ lookupExisting: () => of(cached) });
    (component as any).loadRouteXml(gpx([100, 150, 200]), 'route.gpx', null, 'upload');
    expect(component.analysis).toBe(cached);
    expect(component.stats?.elevationGain).toBe(100);
    expect(component.stats?.maxEle).toBe(200);
    expect(component.analysis?.fallbackReason).toContain('recalculado');
  });

  it('ignores a delayed cached report after selecting a different GPX', () => {
    const first = new Subject<RouteAnalysis | null>();
    const second = new Subject<RouteAnalysis | null>();
    let calls = 0;
    const component = analyzer({ lookupExisting: () => ++calls === 1 ? first : second });
    (component as any).loadRouteXml(gpx([100, 150, 200]), 'first.gpx', null, 'upload');
    (component as any).loadRouteXml(gpx([100, 125, 150]), 'second.gpx', null, 'upload');
    first.next(savedAnalysis());
    expect(component.analysis).toBeNull();
    expect(component.stats?.elevationGain).toBe(50);
    second.next(null);
    first.complete(); second.complete();
  });

  it('preserves null backend elevations and profile gaps in response normalization', () => {
    const service: any = new RouteAnalysisService({} as any);
    const result = service.normalizeRouteStats({ distanceKm: 1, elevationGainM: null, elevationLossM: null,
      minEleM: null, maxEleM: null, elevationVersion: 3, elevationStatus: 'unavailable',
      elevationProfile: [{ distanceKm: 0, elevationM: 100 }, { distanceKm: .5, elevationM: null }, { distanceKm: 1, elevationM: 200 }] });
    expect(result.elevationGainM).toBeNull();
    expect(result.minEleM).toBeNull();
    expect(result.elevationVersion).toBe(3);
    expect(result.elevationProfile[1].elevationM).toBeNull();
  });
});
