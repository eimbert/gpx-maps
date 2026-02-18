import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

type TrackPoint = {
  lat: number;
  lon: number;
  time: string;
  ele?: number;
};

type TrackLocationDetails = {
  population: string | null;
  autonomousCommunity: string | null;
  province: string | null;
};

export type TrackLocationInfo = TrackLocationDetails & {
  startLatitude: number | null;
  startLongitude: number | null;
};

@Injectable({ providedIn: 'root' })
export class GpxImportService {
  private geoCache = new Map<string, TrackLocationDetails>();

  constructor(private http: HttpClient) {}

  async readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  parseTrackPointsFromString(gpxData: string): TrackPoint[] {
    try {
      const parser = new DOMParser();
      const gpx = parser.parseFromString(gpxData, 'application/xml');
      const trkpts = Array.from(gpx.getElementsByTagName('trkpt'));
      if (gpx.getElementsByTagName('parsererror').length || !trkpts.length) return [];
      return trkpts.map(trkpt => ({
        lat: parseFloat(trkpt.getAttribute('lat') || '0'),
        lon: parseFloat(trkpt.getAttribute('lon') || '0'),
        time: trkpt.getElementsByTagName('time')[0]?.textContent || '',
        ele: parseFloat(trkpt.getElementsByTagName('ele')[0]?.textContent || '0')
      }));
    } catch {
      return [];
    }
  }

  extractReportedAscentMeters(gpxData: string): number | null {
    try {
      const parser = new DOMParser();
      const gpx = parser.parseFromString(gpxData, 'application/xml');
      if (gpx.getElementsByTagName('parsererror').length) return null;

      const buckets: Record<'strong' | 'medium' | 'weak', number[]> = {
        strong: [],
        medium: [],
        weak: []
      };

      const nodes = Array.from(gpx.getElementsByTagName('*'));
      for (const node of nodes) {
        const rawName = (node.localName || node.nodeName || '').toLowerCase();
        const normalizedName = rawName.replace(/[^a-z]/g, '');

        let bucket: keyof typeof buckets | null = null;
        if (normalizedName === 'totalascent' || normalizedName === 'totalclimb') {
          bucket = 'strong';
        } else if (normalizedName === 'elevationgain' || normalizedName === 'totalascend') {
          bucket = 'medium';
        } else if (normalizedName === 'ascent') {
          bucket = 'weak';
        }

        if (!bucket) continue;

        const text = node.textContent?.trim() ?? '';
        let value = Number.parseFloat(text.replace(',', '.'));
        if (!Number.isFinite(value)) continue;

        const unit = ((node.getAttribute('unit') || node.getAttribute('units') || node.getAttribute('uom') || '')
          .toLowerCase()
          .trim());
        if (unit === 'ft' || unit === 'feet' || unit === 'foot') {
          value *= 0.3048;
        }

        if (value >= 0 && value <= 20_000) {
          buckets[bucket].push(value);
        }
      }

      const pick = (values: number[]): number | null => {
        if (!values.length) return null;
        // Muchos GPX repiten ascensos parciales; para total acumulado interesa el mayor valor válido.
        return Math.max(...values);
      };

      return pick(buckets.strong) ?? pick(buckets.medium) ?? pick(buckets.weak);
    } catch {
      return null;
    }
  }

  calculateTotalDistanceKm(trkpts: TrackPoint[]): number {
    if (!trkpts.length) return 0;
    let totalDistance = 0;
    for (let i = 1; i < trkpts.length; i++) {
      totalDistance += this.calculateDistance(trkpts[i - 1].lat, trkpts[i - 1].lon, trkpts[i].lat, trkpts[i].lon);
    }
    return totalDistance / 1000;
  }

  calculateActiveDurationSeconds(trkpts: TrackPoint[], pauseThresholdMs = 30_000): number {
    if (!trkpts?.length) return 0;
    const times = trkpts
      .map(p => new Date(p.time).getTime())
      .filter(t => Number.isFinite(t))
      .sort((a, b) => a - b);

    if (times.length < 2) return 0;

    let paused = 0;
    let last = times[0];
    for (let i = 1; i < times.length; i++) {
      const current = times[i];
      const dt = current - last;
      if (dt > pauseThresholdMs) {
        paused += dt;
      }
      last = current;
    }

    const total = times[times.length - 1] - times[0];
    return Math.max(0, (total - paused) / 1000);
  }

  calculateTotalDurationSeconds(trkpts: TrackPoint[]): number {
    if (!trkpts?.length) return 0;
    const times = trkpts.map(p => new Date(p.time).getTime()).filter(t => Number.isFinite(t));

    if (times.length < 2) return 0;

    let min = times[0];
    let max = times[0];

    for (let i = 1; i < times.length; i++) {
      const current = times[i];
      if (current < min) min = current;
      if (current > max) max = current;
    }

    return Math.max(0, (max - min) / 1000);
  }

  async resolveTrackLocationFromGpx(gpxData: string): Promise<TrackLocationInfo> {
    const point = this.extractFirstPointFromGpx(gpxData);
    if (!point) {
      return {
        startLatitude: null,
        startLongitude: null,
        population: null,
        autonomousCommunity: null,
        province: null
      };
    }

    const key = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
    const cached = this.geoCache.get(key);
    if (cached) {
      return { ...cached, startLatitude: point.lat, startLongitude: point.lon };
    }

    const location = await this.reverseGeocode(point.lat, point.lon);
    if (location) {
      this.geoCache.set(key, location);
      return { ...location, startLatitude: point.lat, startLongitude: point.lon };
    }

    return {
      startLatitude: point.lat,
      startLongitude: point.lon,
      population: null,
      autonomousCommunity: null,
      province: null
    };
  }

  private extractFirstPointFromGpx(gpx: string): { lat: number; lon: number } | null {
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(gpx, 'application/xml');
      const trkpt = xml.getElementsByTagName('trkpt')[0] ?? xml.querySelector('trkpt');
      if (!trkpt) return null;
      const lat = parseFloat(trkpt.getAttribute('lat') || '');
      const lon = parseFloat(trkpt.getAttribute('lon') || '');
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { lat, lon };
    } catch {
      return null;
    }
  }

  private async reverseGeocode(lat: number, lon: number): Promise<TrackLocationDetails | null> {
    const url = `https://nominatim.openstreetmap.org/reverse?format=geocodejson&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lon)}&zoom=15&addressdetails=1&layer=address`;

    try {
      const result: any = await firstValueFrom(this.http.get(url, { headers: { Accept: 'application/json' } }));
      const geocoding = result?.features?.[0]?.properties?.geocoding || {};
      const autonomousCommunity = geocoding.state || null;

      if (this.isCatalonia(autonomousCommunity)) {
        const catalanLocation = await this.reverseGeocodeCatalan(lat, lon);
        if (catalanLocation) {
          return catalanLocation;
        }
      }

      return {
        population: geocoding.city || null,
        autonomousCommunity,
        province: geocoding.county || geocoding.state || null
      };
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 425) {
        try {
          const retryResult: any = await firstValueFrom(this.http.get(url, { headers: { Accept: 'application/json' } }));
          const retryGeocoding = retryResult?.features?.[0]?.properties?.geocoding || {};
          return {
            population: retryGeocoding.city || null,
            autonomousCommunity: retryGeocoding.state || null,
            province: retryGeocoding.county || retryGeocoding.state || null
          };
        } catch {
          return this.reverseGeocodeCatalan(lat, lon);
        }
      }

      return this.reverseGeocodeCatalan(lat, lon);
    }
  }

  private async reverseGeocodeCatalan(lat: number, lon: number): Promise<TrackLocationDetails | null> {
    try {
      const url = `https://eines.icgc.cat/geocodificador/invers?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(
        lon
      )}&size=1&topo=1`;
      const result: any = await firstValueFrom(this.http.get(url, { headers: { Accept: 'application/json' } }));
      const properties = result?.features?.[0]?.properties;
      if (!properties) return null;
      return {
        population: properties.municipi || null,
        autonomousCommunity: 'Catalunya',
        province: properties.comarca || null
      };
    } catch {
      return null;
    }
  }

  private isCatalonia(value: string | null | undefined): boolean {
    if (!value) return false;
    const normalized = value
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .trim();
    return normalized === 'cataluna' || normalized === 'catalunya';
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}
