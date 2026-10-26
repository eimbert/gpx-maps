import { MapComponent } from './map.component';
import { GpxImportService } from '../services/gpx-import.service';

describe('Visibilidad de tracks y pendientes', () => {
  let component: any;
  const marker = () => { const element = document.createElement('div'); return { getElement: () => element }; };
  const path = () => document.createElementNS('http://www.w3.org/2000/svg', 'path');
  beforeEach(() => {
    component = new MapComponent({} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any);
    component.map = { getLayer: () => ({}), setLayoutProperty: jasmine.createSpy('visibility') };
    component.trackMetas = [0, 1].map(index => ({
      visible: true, fullLayerId: `full${index}`, progLayerId: `prog${index}`,
      fullSlopeLayerId: `slope${index}`, progSlopeLayerId: `slopeProgress${index}`,
      fullSvgPath: path(), progSvgPath: path(), slopeSvgGroups: [{ path: path(), segments: [] }],
      mark: marker(), startMark: marker(), endMark: marker(), hoverMark: marker(),
      tickMarkers: [marker()], pauseMarkers: [marker()], endpointLabelMarkers: [marker()]
    }));
  });
  it('conserva los colores elegidos para cada recorrido al preparar la animación', () => {
    const colors = ['#4b80f2', '#aef872', '#ff0000', '#ffff00', '#ff8800'];
    const metas = component.buildMetas(colors.map((_, i) => `Ruta ${i}`), colors, colors.map(() => ({ trkpts: [] })));
    expect(metas.map((meta: any) => meta.color)).toEqual(colors);
    component.trackMetas = metas;
    component.map = undefined;
    component.applySanitization();
    expect(component.trackMetas.map((meta: any) => meta.color)).toEqual(colors);
    expect(component.createTrackSvgPath(metas[1].color, 4, 1).getAttribute('stroke')).toBe('#aef872');
    expect(component.resolveDisplayColor('invalid-color', 0)).toBe(component.defaultColors[0]);
    expect(component.resolveDisplayColor(undefined, 1)).toBe(component.defaultColors[1]);
  });
  it('oculta y restaura todas las capas, líneas SVG y marcadores de un solo track', () => {
    for (const checked of [false, true]) {
      component.onTrackVisibilityToggle(0, checked);
      const meta = component.trackMetas[0];
      for (const id of ['full0', 'prog0', 'slope0', 'slopeProgress0']) {
        expect(component.map.setLayoutProperty).toHaveBeenCalledWith(id, 'visibility', checked ? 'visible' : 'none');
      }
      for (const svg of [meta.fullSvgPath, meta.progSvgPath, meta.slopeSvgGroups[0].path]) expect(svg.style.display).toBe(checked ? '' : 'none');
      for (const mark of [meta.mark, meta.startMark, meta.endMark, meta.hoverMark, ...meta.tickMarkers, ...meta.pauseMarkers, ...meta.endpointLabelMarkers]) {
        expect(mark.getElement().style.display).toBe(checked ? '' : 'none');
      }
      expect(component.trackMetas[1].visible).toBeTrue();
      expect(component.trackMetas[1].fullSvgPath.style.display).toBe('');
    }
  });
  it('respeta la opción de tiempos al volver a mostrar el track', () => {
    component.desktopTimesVisible = false;
    component.onTrackVisibilityToggle(0, false);
    component.onTrackVisibilityToggle(0, true);
    expect(component.trackMetas[0].tickMarkers[0].getElement().style.display).toBe('none');
  });
  it('conserva los segmentos de GPX al importar varias rutas desde Planificar', () => {
    const importer = new GpxImportService({} as any);
    const points = importer.parseTrackPointsFromString('<gpx><trk><trkseg><trkpt lat="0" lon="0"><ele>100</ele></trkpt></trkseg><trkseg><trkpt lat="0" lon="0.001"><ele>800</ele></trkpt></trkseg></trk><trk><trkseg><trkpt lat="0" lon="0.002"/></trkseg></trk></gpx>');
    expect(points.map(point => point.segment)).toEqual([0, 1, 2]);
    expect(points[2].ele).toBeUndefined();
  });
  it('cambia juntos el título, distancia, desnivel y perfil de la ruta principal', () => {
    component.viewOnly = true;
    component.map = undefined;
    component.trackMetas = [0, 1, 2].map(index => {
      const raw = Array.from({ length: 11 }, (_, i) => ({ lat: 0, lon: i * .001, ele: 100 + i * (index + 1), time: '', t: i * 1000 }));
      return { name: `Ruta ${index}`, color: '#2563eb', visible: true, raw, sanitized: raw, totalDistance: 1000 * (index + 1), distances: raw.map((_, i) => i * 100 * (index + 1)) };
    });
    component.updateProfileVisual();
    const initial = component.profileVisual;
    expect(component.editorAscentLabel).toBe('10 m');
    component.selectPrimaryTrack(1);
    expect(component.primaryTrackIndex).toBe(1);
    expect(component.editorTrackName).toBe('Ruta 1');
    expect(component.editorDistanceLabel).toBe(component.formatDistance(2000));
    expect(component.editorAscentLabel).toBe('20 m');
    expect(component.profileVisual).not.toBe(initial);
    expect(component.profileCursorX).toBe(0);
    expect(component.trackMetas.every((meta: any) => meta.visible)).toBeTrue();
    component.selectPrimaryTrack(0);
    expect(component.editorAscentLabel).toBe('10 m');
    component.selectPrimaryTrack(99);
    expect(component.primaryTrackIndex).toBe(0);
  });
  it('no conserva el perfil anterior cuando la principal carece de altitud', () => {
    component.viewOnly = true;
    component.map = undefined;
    component.trackMetas = [{ name: 'Inicial', visible: true }, { name: 'Sin altitud', visible: true, raw: [], sanitized: [{ lat: 0, lon: 0, ele: NaN }], distances: [0], totalDistance: 1000 }];
    component.profileVisual = { points: 'anterior' };
    component.selectPrimaryTrack(1);
    expect(component.editorTrackName).toBe('Sin altitud');
    expect(component.profileVisual).toBeNull();
    expect(component.editorAscentLabel).toBe('—');
  });
  it('pasa a la siguiente visible, salta ocultas y vuelve al inicio de la lista', () => {
    component.viewOnly = true;
    component.map = undefined;
    component.trackMetas = [0, 1, 2, 3].map(index => ({ name: `Ruta ${index}`, visible: index !== 1, raw: [], sanitized: [], totalDistance: 0 }));
    component.onTrackVisibilityToggle(0, false);
    expect(component.primaryTrackIndex).toBe(2);
    expect(component.editorTrackName).toBe('Ruta 2');
    component.onTrackVisibilityToggle(0, true);
    expect(component.primaryTrackIndex).toBe(2);
    component.onTrackVisibilityToggle(2, false);
    expect(component.primaryTrackIndex).toBe(3);
    component.onTrackVisibilityToggle(3, false);
    expect(component.primaryTrackIndex).toBe(0);
    expect(component.visibleTrackCount).toBe(1);
    component.onTrackVisibilityToggle(0, false);
    expect(component.trackMetas[0].visible).toBeTrue();
    expect(component.primaryTrackIndex).toBe(0);
    component.selectPrimaryTrack(1);
    expect(component.primaryTrackIndex).toBe(0);
  });
});
