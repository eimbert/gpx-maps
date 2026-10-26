import { calculateTrackSlopes, slopeColor, SlopePoint, SLOPE_SCALE } from './track-slopes';

describe('Pendientes del mapa', () => {
  const route = (step: number, elevation: (distance: number, index: number) => number | null): SlopePoint[] =>
    Array.from({ length: Math.round(1000 / step) + 1 }, (_, i) => ({
      lat: 0, lon: i * step * 180 / (Math.PI * 6371000), ele: elevation(i * step, i), segment: 0
    }));
  const middle = (points: SlopePoint[]) => calculateTrackSlopes(points).slice(10, -10) as number[];

  it('conserva rampas conocidas y su signo con distintas densidades', () => {
    for (const grade of [0, 3, 5, 8, 10, 15, -8, -15]) {
      for (const step of [1, 5, 20]) {
        middle(route(step, distance => 100 + distance * grade / 100))
          .forEach(value => expect(value).toBeCloseTo(grade, 5));
      }
    }
  });
  it('solo colorea ascensos y conserva el color de cada track en llanos y bajadas', () => {
    for (const color of ['#2563eb', '#7c3aed']) {
      expect(slopeColor(0, color)).toBe(color);
      expect(slopeColor(-0.01, color)).toBe(color);
      expect(slopeColor(-15, color)).toBe(color);
      expect(slopeColor(0.01, color)).toBe(SLOPE_SCALE[0].color);
      expect(slopeColor(4.99, color)).toBe(SLOPE_SCALE[0].color);
      expect(slopeColor(5, color)).toBe(SLOPE_SCALE[1].color);
      expect(slopeColor(9.99, color)).toBe(SLOPE_SCALE[1].color);
      expect(slopeColor(10, color)).toBe(SLOPE_SCALE[2].color);
      expect(slopeColor(null, color)).toBe(SLOPE_SCALE[3].color);
      expect(slopeColor(NaN, color)).toBe(SLOPE_SCALE[3].color);
    }
  });
  it('filtra ruido GPS e impulsos aislados sin convertir un llano en rampas', () => {
    const noise = middle(route(1, d => 100 + 2 * Math.sin(d * 2.1)));
    expect(noise.every(value => [SLOPE_SCALE[0].color, '#2563eb'].includes(slopeColor(value, '#2563eb')))).toBeTrue();
    const spike = calculateTrackSlopes(route(10, (_, i) => i === 50 ? 850 : 100));
    expect(spike.filter(value => value !== null).every(value => Math.abs(value!) < 0.01)).toBeTrue();
  });
  it('no calcula rampas entre segmentos, tracks ni alturas ausentes o estimadas', () => {
    for (const boundary of ['segment', 'sourceTrack', 'missing', 'estimated']) {
      const points = route(10, (_, i) => i < 50 ? 100 : 800);
      if (boundary === 'segment' || boundary === 'sourceTrack') points.forEach((p, i) => p[boundary] = i < 50 ? 0 : 1);
      if (boundary === 'missing') points[50].ele = null;
      if (boundary === 'estimated') points[50].estimatedElevation = true;
      const slopes = calculateTrackSlopes(points);
      expect(slopes[50]).toBeNull();
      expect(slopes.filter(value => value !== null).every(value => Math.abs(value!) < 0.01)).toBeTrue();
    }
  });
  it('no inventa pendientes para huecos largos, paradas o recorridos demasiado cortos', () => {
    expect(calculateTrackSlopes(route(200, d => d)).every(value => value === null)).toBeTrue();
    expect(calculateTrackSlopes(Array.from({ length: 50 }, (_, ele) => ({ lat: 0, lon: 0, ele }))).every(value => value === null)).toBeTrue();
    expect(calculateTrackSlopes(route(1, d => d).slice(0, 10)).every(value => value === null)).toBeTrue();
  });
  it('mantiene la rampa real al invertir el recorrido', () => {
    const points = route(5, d => 100 + d * 0.12);
    const forward = middle(points), reverse = middle([...points].reverse());
    forward.forEach((value, i) => expect(value).toBeCloseTo(-reverse[i], 5));
    expect(forward.every(value => slopeColor(value, '#2563eb') === SLOPE_SCALE[2].color)).toBeTrue();
    expect(reverse.every(value => slopeColor(value, '#2563eb') === '#2563eb')).toBeTrue();
  });
});
