import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { CreateEventPayload } from '../interfaces/events';
import { InfoMessageService } from '../services/info-message.service';

export interface EventCreateDialogResult {
  event: CreateEventPayload;
}

@Component({
  selector: 'app-event-create-dialog',
  templateUrl: './event-create-dialog.component.html',
  styleUrls: ['./event-create-dialog.component.css']
})
export class EventCreateDialogComponent {
  newEvent = {
    name: '',
    population: '',
    autonomousCommunity: '',
    province: '',
    year: new Date().getFullYear(),
    distanceKm: null as number | null,
    distante_km: null as number | null,
    logoBlob: '',
    logoMime: '',
    gpxMaster: '',
    gpxMasterFileName: ''
  };

  constructor(
    private dialogRef: MatDialogRef<EventCreateDialogComponent, EventCreateDialogResult | undefined>,
    private infoMessageService: InfoMessageService
  ) { }

  private showMessage(message: string): void {
    this.infoMessageService.showMessage({
      title: 'Datos requeridos',
      message
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  async onSave(): Promise<void> {
    if (!this.newEvent.name.trim() || !this.newEvent.population.trim()) {
      this.showMessage('Completa el nombre y la población del evento.');
      return;
    }

    if (!this.newEvent.gpxMaster) {
      this.showMessage('Sube un track GPX válido para continuar.');
      return;
    }

    if (!this.newEvent.year || this.newEvent.year <= 0) {
      this.showMessage('Introduce un año válido (número entero positivo).');
      return;
    }

    const distanceKm = this.normalizeNumber(this.newEvent.distanceKm);

    const event: CreateEventPayload = {
      name: this.newEvent.name.trim(),
      population: this.newEvent.population.trim(),
      autonomousCommunity: this.newEvent.autonomousCommunity.trim(),
      province: this.newEvent.province.trim(),
      year: this.newEvent.year,
      distanceKm,
      distante_km: distanceKm,
      logoBlob: this.newEvent.logoBlob || null,
      logoMime: this.newEvent.logoMime || null,
      gpxMaster: this.newEvent.gpxMaster || null,
      gpxMasterFileName: this.newEvent.gpxMasterFileName || null,
    };

    this.dialogRef.close({ event });
  }

  async handleLogoUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [mimePart, logoBlob] = dataUrl.split(';base64,');
      const mime = mimePart?.replace('data:', '') || '';
      this.newEvent.logoMime = mime;
      this.newEvent.logoBlob = logoBlob || '';
    };
    reader.readAsDataURL(file);
  }

  async handleGpxUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.gpx')) {
      this.showMessage('Selecciona un archivo GPX válido.');
      input.value = '';
      return;
    }

    const text = await file.text();
    const parsed = this.parseGpx(text);
    if (!parsed) {
      this.showMessage('El archivo GPX no parece válido.');
      input.value = '';
      return;
    }

    this.newEvent.gpxMaster = this.encodeBase64(text);
    this.newEvent.gpxMasterFileName = file.name;
    this.newEvent.distanceKm = parsed.distanceKm;
    this.newEvent.distante_km = parsed.distanceKm;
    this.newEvent.year = parsed.year ?? this.newEvent.year;

    if (parsed.location) {
      await this.populateLocationFromReverseGeocode(parsed.location.lat, parsed.location.lon);
    }
  }

  private parseGpx(content: string): { distanceKm: number | null; location: { lat: number; lon: number } | null; year: number | null } | null {
    try {
      const parser = new DOMParser();
      const gpx = parser.parseFromString(content, 'application/xml');
      const trkpts = Array.from(gpx.getElementsByTagName('trkpt'));
      if (gpx.getElementsByTagName('parsererror').length || !trkpts.length) return null;

      const location = this.extractFirstLocation(trkpts[0]);
      const distanceKm = this.calculateDistanceKm(trkpts);
      const year = this.extractYear(gpx);

      return { distanceKm, location, year };
    } catch {
      return null;
    }
  }

  private extractFirstLocation(point: Element | undefined): { lat: number; lon: number } | null {
    if (!point) return null;
    const lat = parseFloat(point.getAttribute('lat') || '0');
    const lon = parseFloat(point.getAttribute('lon') || '0');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  }

  private calculateDistanceKm(trkpts: Element[]): number | null {
    if (!trkpts.length) return null;
    let distanceMeters = 0;
    for (let i = 1; i < trkpts.length; i++) {
      const prevLat = parseFloat(trkpts[i - 1].getAttribute('lat') || '0');
      const prevLon = parseFloat(trkpts[i - 1].getAttribute('lon') || '0');
      const lat = parseFloat(trkpts[i].getAttribute('lat') || '0');
      const lon = parseFloat(trkpts[i].getAttribute('lon') || '0');
      if (!Number.isFinite(prevLat) || !Number.isFinite(prevLon) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }
      distanceMeters += this.haversineDistance(prevLat, prevLon, lat, lon);
    }
    return Number.isFinite(distanceMeters) ? Number((distanceMeters / 1000).toFixed(2)) : null;
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => deg * (Math.PI / 180);
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private extractYear(gpx: Document): number | null {
    const timeNode = gpx.getElementsByTagName('metadata')[0]?.getElementsByTagName('time')[0]
      || gpx.getElementsByTagName('time')[0];
    const timeValue = timeNode?.textContent?.trim();
    if (!timeValue) return null;
    const date = new Date(timeValue);
    const year = date.getFullYear();
    return Number.isFinite(year) ? year : null;
  }

  private async populateLocationFromReverseGeocode(lat: number, lon: number): Promise<void> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=geocodejson&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lon)}&zoom=15&addressdetails=1&layer=address`;
      let response = await fetch(url, {
        headers: {
          Accept: 'application/json'
        }
      });

      if (response.status === 425) {
        await this.delay(500);
        response = await fetch(url, {
          headers: {
            Accept: 'application/json'
          }
        });
      }

      if (!response.ok) {
        const catalanLocation = await this.reverseGeocodeCatalan(lat, lon);
        if (catalanLocation) {
          this.newEvent.population = catalanLocation.population || this.newEvent.population;
          this.newEvent.autonomousCommunity = catalanLocation.autonomousCommunity || this.newEvent.autonomousCommunity;
          this.newEvent.province = catalanLocation.province || this.newEvent.province;
        }
        return;
      }

      const data = await response.json();
      const geocoding = data?.features?.[0]?.properties?.geocoding || {};
      const autonomousCommunity = geocoding.state || null;

      if (this.isCatalonia(autonomousCommunity)) {
        const catalanLocation = await this.reverseGeocodeCatalan(lat, lon);
        if (catalanLocation) {
          this.newEvent.population = catalanLocation.population || this.newEvent.population;
          this.newEvent.autonomousCommunity = catalanLocation.autonomousCommunity || this.newEvent.autonomousCommunity;
          this.newEvent.province = catalanLocation.province || this.newEvent.province;
          return;
        }
      }

      this.newEvent.population = geocoding.city || this.newEvent.population;
      this.newEvent.autonomousCommunity = autonomousCommunity || this.newEvent.autonomousCommunity;
      this.newEvent.province = geocoding.county || geocoding.state || this.newEvent.province;
    } catch {
      const catalanLocation = await this.reverseGeocodeCatalan(lat, lon);
      if (catalanLocation) {
        this.newEvent.population = catalanLocation.population || this.newEvent.population;
        this.newEvent.autonomousCommunity = catalanLocation.autonomousCommunity || this.newEvent.autonomousCommunity;
        this.newEvent.province = catalanLocation.province || this.newEvent.province;
      }
    }
  }

  private async reverseGeocodeCatalan(
    lat: number,
    lon: number
  ): Promise<{ population: string | null; autonomousCommunity: string; province: string | null } | null> {
    try {
      const url = `https://eines.icgc.cat/geocodificador/invers?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(
        lon
      )}&size=1&topo=1`;
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json'
        }
      });
      if (!response.ok) return null;
      const data = await response.json();
      const properties = data?.features?.[0]?.properties;
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private encodeBase64(content: string): string {
    try {
      return btoa(unescape(encodeURIComponent(content)));
    } catch {
      return btoa(content);
    }
  }

  private normalizeNumber(value: number | null): number | null {
    if (value === null || value === undefined) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
}
