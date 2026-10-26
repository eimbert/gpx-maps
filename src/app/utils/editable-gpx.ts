/** Original point XML travels with a point so untouched sensor data survives editing. */
export interface EditableGpxPoint {
  lat: number; lon: number; ele: number; time: string;
  sourceXml?: string; sourceTrack?: number; segment?: number;
  estimatedElevation?: boolean;
}

export function readEditableGpx(xml: string): EditableGpxPoint[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) return [];
  const serializer = new XMLSerializer();
  const points: EditableGpxPoint[] = [];
  Array.from(doc.getElementsByTagName('trk')).forEach((track, sourceTrack) => {
    Array.from(track.getElementsByTagName('trkseg')).forEach((segment, segmentIndex) => {
      Array.from(segment.getElementsByTagName('trkpt')).forEach(node => {
        const lat = Number(node.getAttribute('lat')), lon = Number(node.getAttribute('lon'));
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
        points.push({ lat, lon, ele: Number(node.getElementsByTagName('ele')[0]?.textContent ?? NaN),
          time: node.getElementsByTagName('time')[0]?.textContent ?? '', sourceTrack, segment: segmentIndex,
          sourceXml: serializer.serializeToString(node) });
      });
    });
  });
  return points;
}

export function writeEditableGpx(xml: string, points: EditableGpxPoint[]): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror') || !points.length) throw new Error('GPX inválido');
  const root = doc.documentElement;
  const ns = root.namespaceURI || 'http://www.topografix.com/GPX/1/1';
  const oldTracks = Array.from(doc.getElementsByTagName('trk'));
  const anchor = oldTracks[0] ?? null;
  let track: Element | null = null, segment: Element | null = null;
  let previousTrack = -1, previousSegment = -1;
  for (const point of points) {
    const trackIndex = point.sourceTrack ?? 0, segmentIndex = point.segment ?? 0;
    if (!track || trackIndex !== previousTrack) {
      track = oldTracks[trackIndex]?.cloneNode(true) as Element || doc.createElementNS(ns, 'trk');
      Array.from(track.getElementsByTagName('trkseg')).forEach(node => node.remove());
      root.insertBefore(track, anchor);
      previousTrack = trackIndex;
      previousSegment = -1;
    }
    if (!segment || segmentIndex !== previousSegment) {
      segment = oldTracks[trackIndex]?.getElementsByTagName('trkseg')[segmentIndex]?.cloneNode(true) as Element || doc.createElementNS(ns, 'trkseg');
      Array.from(segment.getElementsByTagName('trkpt')).forEach(node => node.remove());
      track.appendChild(segment);
      previousSegment = segmentIndex;
    }
    const original = point.sourceXml
      ? new DOMParser().parseFromString(point.sourceXml, 'application/xml').documentElement : null;
    const node = original && original.localName === 'trkpt'
      ? doc.importNode(original, true) : doc.createElementNS(ns, 'trkpt');
    node.setAttribute('lat', String(point.lat));
    node.setAttribute('lon', String(point.lon));
    for (const tag of ['ele', 'time']) {
      Array.from(node.children).filter(child => child.localName === tag).forEach(child => child.remove());
    }
    // GPX requires ele and time before extensions.
    if (point.time) {
      const time = doc.createElementNS(ns, 'time'); time.textContent = point.time;
      node.insertBefore(time, node.firstChild);
    }
    if (Number.isFinite(point.ele)) {
      const ele = doc.createElementNS(ns, 'ele'); ele.textContent = String(point.ele);
      node.insertBefore(ele, node.firstChild);
    }
    segment.insertBefore(node, Array.from(segment.children).find(child => child.localName === 'extensions') ?? null);
  }
  oldTracks.forEach(node => node.remove());
  return new XMLSerializer().serializeToString(doc);
}
