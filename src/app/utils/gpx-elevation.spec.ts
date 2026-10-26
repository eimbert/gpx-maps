import { calculateGpxElevation } from './gpx-elevation';

describe('GPX elevation XML contract', () => {
  const xml = (body: string) => `<gpx xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`;
  it('supports namespace-prefixed track points and ignores ascent metadata', () => {
    const result = calculateGpxElevation('<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1"><g:metadata><g:ascent>9999</g:ascent></g:metadata><g:trk><g:trkseg><g:trkpt lat="0" lon="0"><g:ele>100</g:ele></g:trkpt><g:trkpt lat="0" lon="0.01"><g:ele>200</g:ele></g:trkpt></g:trkseg></g:trk></g:gpx>');
    expect(result.gain).toBe(100);
  });
  it('supports route GPX without track segments', () => {
    expect(calculateGpxElevation(xml('<rte><rtept lat="0" lon="0"><ele>100</ele></rtept><rtept lat="0" lon="0.01"><ele>200</ele></rtept></rte>')).gain).toBe(100);
  });
  it('does not join altitude across separate segments', () => {
    expect(calculateGpxElevation(xml('<trk><trkseg><trkpt lat="0" lon="0"><ele>100</ele></trkpt><trkpt lat="0" lon="0.01"><ele>100</ele></trkpt></trkseg><trkseg><trkpt lat="0" lon="0.02"><ele>900</ele></trkpt><trkpt lat="0" lon="0.03"><ele>900</ele></trkpt></trkseg></trk>')).gain).toBe(0);
  });
  it('does not interpret missing or blank elevations as sea level', () => {
    const result = calculateGpxElevation(xml('<trk><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon="0.01"><ele> </ele></trkpt></trkseg></trk>'));
    expect(result.gain).toBeNull();
    expect(result.status).toBe('unavailable');
  });
  it('rejects malformed XML, non GPX, and document types', () => {
    expect(() => calculateGpxElevation('<gpx><trk></gpx>')).toThrow();
    expect(() => calculateGpxElevation('<root/>')).toThrow();
    expect(() => calculateGpxElevation('<!DOCTYPE gpx><gpx/>')).toThrow();
  });
});
