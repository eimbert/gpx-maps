import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { formatDate } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { IncorporateRideDialogComponent } from './incorporate-ride-dialog.component';
import { firstValueFrom, forkJoin, Subscription, timer } from 'rxjs';
import * as L from 'leaflet';
import { GarminDeviceStatus, GarminInboxService, GarminRideStatus } from './garmin-inbox.service';
import { LanguageService } from '../services/language.service';
import { garminTranslations, GarminTextKey } from './garmin-translations';
import { PolarConnectionStatus, PolarInboxService, PolarRideStatus } from './polar-inbox.service';
import { PolarInboxComponent } from './polar-inbox.component';
import { InboxRide, garminRide, polarRide, wahooRide } from './inbox-ride';
import { WahooConnectionStatus, WahooInboxService, WahooRideStatus } from './wahoo-inbox.service';
import { WahooInboxComponent } from './wahoo-inbox.component';
import { providerTranslations } from './provider-translations';

@Component({
  selector: 'app-garmin-sync',
  templateUrl: './garmin-sync.component.html',
  styleUrls: ['./garmin-sync.component.css', './inbox-design.css']
})
export class GarminSyncComponent implements OnInit, OnDestroy {
  code = '';
  devices: GarminDeviceStatus[] = [];
  rides: GarminRideStatus[] = [];
  loading = false;
  pairing = false;
  busyRideId: string | null = null;
  selectedProvider: 'garmin' | 'polar' | 'wahoo' | null = null;
  previewRideId: string | null = null;
  errorKey: GarminTextKey | null = null;
  messageKey: GarminTextKey | null = null;
  incorporatedRide: InboxRide | null = null;
  polarRides: PolarRideStatus[] = [];
  @ViewChild(PolarInboxComponent) polarPanel?: PolarInboxComponent;
  wahooRides: WahooRideStatus[] = [];
  @ViewChild(WahooInboxComponent) wahooPanel?: WahooInboxComponent;
  wahooAvailable = false;
  wahooConnected = false;
  wahooStatusChanged(status: WahooConnectionStatus): void {
    this.wahooAvailable = status.available; this.wahooConnected = status.connected;
  }
  wahooRidesChanged(rides: WahooRideStatus[]): void { this.wahooRides = rides; this.checkPreview(); }
  polarAvailable = false;
  polarConnected = false;

  polarStatusChanged(status: PolarConnectionStatus): void {
    this.polarAvailable = status.available;
    this.polarConnected = status.connected;
  }

  private refreshSubscription?: Subscription;
  private map?: L.Map;

  constructor(private inbox: GarminInboxService, private polar: PolarInboxService, private wahoo: WahooInboxService, public languageService: LanguageService, private dialog: MatDialog) {}

  get providerText() { return providerTranslations[this.languageService.current]; }

  selectProvider(provider: 'garmin' | 'polar' | 'wahoo'): void {
    this.selectedProvider = this.selectedProvider === provider ? null : provider;
  }

  private get allRides(): InboxRide[] {
    return [...this.rides.map(garminRide), ...this.polarRides.map(polarRide), ...this.wahooRides.map(wahooRide)]
      .sort((a, b) => b.rideStart - a.rideStart || a.key.localeCompare(b.key));
  }

  polarRidesChanged(rides: PolarRideStatus[]): void {
    this.polarRides = rides;
    this.checkPreview();
  }

  private checkPreview(): void {
    if (this.previewRideId && !this.pendingRides.some(ride => ride.key === this.previewRideId)) this.closePreview();
  }

  t(key: GarminTextKey): string {
    return garminTranslations[this.languageService.current][key];
  }

  get pendingRides(): InboxRide[] {
    return this.allRides.filter(ride => ride.inboxStatus === 'PENDING');
  }

  get incorporatedRides(): InboxRide[] {
    return this.allRides.filter(ride => ride.inboxStatus === 'INCORPORATED');
  }

  trackRide(_index: number, ride: InboxRide): string {
    return ride.key;
  }

  ngOnInit(): void {
    this.refreshSubscription = timer(0, 15000).subscribe(() => this.refresh());
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
    this.closePreview();
  }

  async pair(): Promise<void> {
    const code = this.code.replace(/\s/g, '');
    if (!/^\d{10}$/.test(code)) {
      this.errorKey = 'invalidCode';
      return;
    }
    this.pairing = true;
    this.errorKey = null;
    this.messageKey = null;
    try {
      await firstValueFrom(this.inbox.pair(code));
      this.code = '';
      this.messageKey = 'paired';
      await this.refresh();
    } catch (error) {
      const status = (error as HttpErrorResponse).status;
      this.errorKey = status === 404 ? 'codeNotFound'
        : status === 410 ? 'codeExpired'
        : status === 429 ? 'tooManyAttempts'
        : 'pairFailed';
    } finally {
      this.pairing = false;
    }
  }

  async refresh(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    const providerRefresh = Promise.all([this.polarPanel?.refresh(), this.wahooPanel?.refresh()]);
    try {
      const result = await firstValueFrom(forkJoin({ devices: this.inbox.devices(), rides: this.inbox.rides() }));
      this.devices = result.devices;
      this.rides = result.rides;
      this.checkPreview();
    } catch {
      this.errorKey = 'refreshFailed';
    } finally {
      await providerRefresh;
      this.loading = false;
    }
  }

  async incorporate(ride: InboxRide): Promise<void> {
    if (this.busyRideId !== null) return;
    this.busyRideId = ride.key;
    this.errorKey = null;
    try {
      const choice = await firstValueFrom(this.dialog.open(IncorporateRideDialogComponent, {
        width: '480px', maxWidth: '94vw', panelClass: 'tracketeo-playback-dialog',
        data: { name: this.suggestedRideName(ride) }
      }).afterClosed());
      if (!choice) return;
      this.incorporatedRide = ride.provider === 'Wahoo'
        ? wahooRide(await firstValueFrom(this.wahoo.incorporate(ride.id, choice.name, choice.shared)))
        : ride.provider === 'Polar'
        ? polarRide(await firstValueFrom(this.polar.incorporate(ride.id, choice.name, choice.shared)))
        : garminRide(await firstValueFrom(this.inbox.incorporate(ride.id, choice.name, choice.shared)));
      this.messageKey = 'incorporatedMessage';
      await this.refresh();
    } catch (error) {
      this.errorKey = (error as HttpErrorResponse).status === 402
        ? 'routeLimit' : 'incorporateFailed';
    } finally {
      this.busyRideId = null;
    }
  }

  async discard(ride: InboxRide): Promise<void> {
    if (!window.confirm(this.t('confirmDiscard'))) return;
    this.busyRideId = ride.key;
    this.errorKey = null;
    try {
      await firstValueFrom(ride.provider === 'Wahoo' ? this.wahoo.discard(ride.id) : ride.provider === 'Polar' ? this.polar.discard(ride.id) : this.inbox.discard(ride.id));
      if (this.previewRideId === ride.key) this.closePreview();
      this.messageKey = 'discardedMessage';
      await this.refresh();
    } catch {
      this.errorKey = 'discardFailed';
    } finally {
      this.busyRideId = null;
    }
  }

  async openPreview(ride: InboxRide): Promise<void> {
    if (this.previewRideId === ride.key) {
      this.closePreview();
      return;
    }
    this.closePreview();
    this.errorKey = null;
    try {
      const points = await firstValueFrom(ride.provider === 'Wahoo' ? this.wahoo.preview(ride.id) : ride.provider === 'Polar' ? this.polar.preview(ride.id) : this.inbox.preview(ride.id));
      const latLngs = points.map(point => ride.provider !== 'Garmin' ? L.latLng(point[0], point[1]) : L.latLng(point[1], point[2]));
      if (!latLngs.length) return;
      this.previewRideId = ride.key;
      setTimeout(() => {
        if (this.previewRideId !== ride.key) return;
        this.map = L.map('garmin-preview-map', { scrollWheelZoom: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
        }).addTo(this.map);
    L.polyline(latLngs, { color: '#ffffff', weight: 9, opacity: 0.95, interactive: false }).addTo(this.map);
    const line = L.polyline(latLngs, { color: '#075bd6', weight: 5, opacity: 1 }).addTo(this.map);
        this.map.fitBounds(line.getBounds(), { padding: [20, 20], maxZoom: 15 });
      });
    } catch {
      this.errorKey = 'previewFailed';
    }
  }

  closePreview(): void {
    this.map?.remove();
    this.map = undefined;
    this.previewRideId = null;
  }

  rideDate(ride: GarminRideStatus): Date {
    return new Date(ride.rideStart * 1000);
  }

  private suggestedRideName(ride: InboxRide): string {
    const name = ride.name?.trim() || this.t('rideTitle');
    const date = this.rideDate(ride);
    if (!ride.rideStart || !Number.isFinite(date.getTime())) return name.slice(0, 255);
    // Use the activity start in the viewer's local time, as in the inbox history.
    const stamp = formatDate(date, 'dd/MM/yyyy HH:mm', 'en');
    if (name.includes(stamp)) return name.slice(0, 255);
    const suffix = ` · ${stamp}`;
    return name.slice(0, 255 - suffix.length).trimEnd() + suffix;
  }

  duration(seconds: number | null): string {
    if (seconds === null) return '—';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
  }

  rideLocation(ride: InboxRide): string {
    return `${this.t('provinceLabel')}: ${ride.province || this.t('missingProvince')} · `
      + `${this.t('populationLabel')}: ${ride.population || this.t('missingPopulation')}`;
  }
}
