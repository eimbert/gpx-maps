import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuTrigger } from '@angular/material/menu';
import { firstValueFrom } from 'rxjs';
import { DialogoConfiguracionComponent } from '../dialogo-configuracion/dialogo-configuracion.component';
import { DialogoConfiguracionData } from '../interfaces/estructuras';
import { TrackMetadataDialogComponent, TrackMetadataDialogResult } from '../track-metadata-dialog/track-metadata-dialog.component';
import { RouteMismatchDialogComponent } from '../route-mismatch-dialog/route-mismatch-dialog.component';
import { EventSearchDialogComponent, EventSearchDialogData, EventSearchDialogResult } from '../event-search-dialog/event-search-dialog.component';
import { BikeType, CreateEventPayload, CreateTrackPayload, EventTrack, RaceCategory, RaceEvent, RouteTrackTime, TrackGpxFile } from '../interfaces/events';
import { EventService } from '../services/event.service';
import { EventCreateDialogComponent, EventCreateDialogResult } from '../event-create-dialog/event-create-dialog.component';
import { EventTrackUploadDialogComponent, EventTrackUploadDialogData, EventTrackUploadDialogResult } from '../event-track-upload-dialog/event-track-upload-dialog.component';
import { UserIdentityService } from '../services/user-identity.service';
import { AuthService } from '../services/auth.service';
import { Subscription } from 'rxjs';
import { InfoDialogComponent, InfoDialogData, InfoDialogResult } from '../info-dialog/info-dialog.component';
import { MyTrackRow, MyTracksDialogComponent } from '../my-tracks-dialog/my-tracks-dialog.component';
import { StandaloneTrackUploadDialogComponent, StandaloneTrackUploadResult } from '../standalone-track-upload-dialog/standalone-track-upload-dialog.component';

interface TrackPoint {
  lat: number;
  lon: number;
  ele: number;
  time: string;
  hr: number | null;
}

interface LoadedTrack {
  name: string;
  color: string;
  fileName: string;
  details: { date: string; distance: number; ascent: number };
  data: { elevations: number[]; trkpts: TrackPoint[] };
}

interface ParsedTrackResult {
  track: LoadedTrack;
  durationSeconds: number;
}

interface ProfileVisual {
  points: string;
  gridLinesY: number[];
  stats: {
    initialElevation: number;
    maxElevation: number;
    distanceKm: number;
  };
}

interface EventVisuals {
  profile: ProfileVisual | null;
  trackPath: string | null;
  mapTileUrl: string | null;
}

interface EventTrackUploadDraft {
  eventId: number | null;
  modalityId: number | null;
  category: RaceCategory;
  bikeType: BikeType;
  distanceKm: number | null;
  file: File | null;
}

interface EventTrackUploadPayload {
  eventId: number;
  modalityId: number | null;
  category: RaceCategory;
  bikeType: BikeType;
  distanceKm: number;
  file: File;
}

interface UserTrackRow {
  trackId: number;
  routeId: number | null;
  eventName: string;
  year: number;
  autonomousCommunity: string | null;
  province: string | null;
  population: string | null;
  distanceKm: number;
  timeSeconds: number;
  totalTimeSeconds: number;
  gpxData?: string | null;
  gpxAsset?: string | null;
  fileName?: string | null;
  canDelete: boolean;
  title?: string | null;
  description?: string | null;
}

@Component({
  selector: 'app-load-gpx',
  templateUrl: './load-gpx.component.html',
  styleUrls: ['./load-gpx.component.css']
})
export class LoadGpxComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('masterGpxInput') masterGpxInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild(MatMenuTrigger) eventMenuTrigger?: MatMenuTrigger;

  readonly maxTracks = 5;
  readonly maxComparison = 4;
  private readonly overlapThreshold = 0.65;
  private readonly overlapProximityMeters = 150;
  isDragOver = false;
  tracks: LoadedTrack[] = [];
  isAuthenticated = false;
  private sessionSub?: Subscription;
  private eventsNoticeShown = false;

  mode: 'routes' | 'events' = 'routes';
  events: RaceEvent[] = [];
  selectedEventId: number | null = null;
  selectedModalityId: number | null = null;
  carouselIndex = 0;
  private carouselTimer?: ReturnType<typeof setInterval>;
  private readonly carouselIntervalMs = 9000;
  selectedComparisonIds = new Set<number>();
  latestUploadedTrackId: number | null = null;
  personalNickname = '';
  personalHistory: EventTrack[] = [];
  routeTrackTimes: RouteTrackTime[] = [];
  eventVisuals: Record<number, EventVisuals> = {};
  readonly profileWidth = 240;
  readonly profileHeight = 80;
  private pendingMasterUploadEventId: number | null = null;
  eventMenuOpen = false;
  userTracks: UserTrackRow[] = [];
  userTracksLoading = false;
  private readonly downloadingTracks = new Set<number>();
  private readonly deletingTracks = new Set<number>();
  standaloneUploadInProgress = false;

  eventUpload: EventTrackUploadDraft = {
    eventId: null,
    category: 'Senior M' as RaceCategory,
    bikeType: 'MTB' as BikeType,
    modalityId: null,
    distanceKm: null,
    file: null
  };

  categories: RaceCategory[] = ['Sub 23M', 'Sub 23F', 'Senior M', 'Senior F', 'Master 40M', 'Master 40F', 'Master 50M', 'Master 50F', 'Master 60M', 'Master 60F'];
  bikeTypes: BikeType[] = ['MTB', 'Carretera', 'Gravel', 'e-Bike'];
  private readonly userId: number;

  constructor(
    public dialog: MatDialog,
    private router: Router,
    private route: ActivatedRoute,
    private eventService: EventService,
    private http: HttpClient,
    private authService: AuthService,
    identityService: UserIdentityService) {
    this.userId = identityService.getUserId();
  }

  private openInfoDialog(data: InfoDialogData): Promise<InfoDialogResult | undefined> {
    const dialogRef = this.dialog.open<InfoDialogComponent, InfoDialogData, InfoDialogResult>(InfoDialogComponent, {
      width: '420px',
      data
    });

    return firstValueFrom(dialogRef.afterClosed());
  }

  private showMessage(message: string, title = 'Aviso'): void {
    this.openInfoDialog({
      title,
      message
    });
  }

  ngOnInit() {
    this.applyInitialMode();
    this.isAuthenticated = this.authService.isAuthenticated();
    this.personalNickname = this.authService.getSession()?.nickname ?? '';
    this.sessionSub = this.authService.sessionChanges$.subscribe(session => {
      this.isAuthenticated = !!session;
      this.personalNickname = session?.nickname ?? '';
      if (!this.isAuthenticated && this.mode === 'events') {
        this.showEventsAuthNotice();
        this.userTracks = [];
      }
      if (this.isAuthenticated) {
        this.refreshUserTracks();
      }
    });
    this.authService.validateSessionWithBackend().subscribe(session => {
      this.isAuthenticated = !!session;
      this.personalNickname = session?.nickname ?? '';
      if (!this.isAuthenticated && this.mode === 'events') {
        this.showEventsAuthNotice();
      }
      if (this.isAuthenticated) {
        this.refreshUserTracks();
      }
    });
    this.eventService.getEvents().subscribe(events => {
      console.log("Events: ", events )
      this.events = events;
      this.syncCarouselIndex();
      this.syncSelectionWithCarousel();
      this.restartCarouselTimer();
      this.buildEventVisuals(events);
      if (this.isAuthenticated) {
        this.refreshUserTracks();
      }
    });
  }

  ngOnDestroy(): void {
    this.clearCarouselTimer();
    this.sessionSub?.unsubscribe();
  }

  get selectedEvent(): RaceEvent | undefined {
    return this.events.find(e => e.id === this.selectedEventId);
  }

  private applyInitialMode(): void {
    const modeFromRoute = (this.route.snapshot.data['mode'] || this.route.snapshot.queryParamMap.get('mode')) as
      | 'routes'
      | 'events'
      | null;

    if (modeFromRoute === 'routes' || modeFromRoute === 'events') {
      this.mode = modeFromRoute;
    }

    if (this.mode === 'events' && !this.authService.isAuthenticated()) {
      this.showEventsAuthNotice();
    }
  }

  selectMode(mode: 'routes' | 'events'): void {
    this.mode = mode;
    if (mode === 'events' && !this.isAuthenticated) {
      this.showEventsAuthNotice();
    }
  }

  selectEvent(eventId: number, modalityId?: number): void {
    if (!this.ensureEventsAccess()) return;
    this.selectedEventId = eventId;
    this.eventUpload.eventId = eventId;
    const event = this.selectedEvent;
    this.carouselIndex = Math.max(0, this.events.findIndex(e => e.id === eventId));
    this.selectedComparisonIds.clear();
    if (event?.tracks?.length) {
      event.tracks.slice(0, 3).forEach(track => this.selectedComparisonIds.add(track.id));
    }
    this.selectedModalityId = modalityId ?? event?.modalities?.[0]?.id ?? null;
    const selectedModality = event?.modalities?.find(m => m.id === this.selectedModalityId) ?? event?.modalities?.[0];
    this.eventUpload = {
      ...this.eventUpload,
      eventId: eventId,
      modalityId: this.selectedModalityId,
      distanceKm: selectedModality?.distanceKm ?? null
    };
    if (this.personalNickname) {
      this.refreshPersonalHistory();
    }
    this.loadRouteTrackTimes(eventId);
  }

  handleEventSelection(eventId: number | null): void {
    if (!eventId) {
      this.selectedEventId = null;
      this.selectedModalityId = null;
      this.selectedComparisonIds.clear();
      this.personalHistory = [];
      this.routeTrackTimes = [];
      this.eventUpload = { ...this.eventUpload, eventId: null, modalityId: null, distanceKm: null };
      return;
    }

    this.selectEvent(eventId);
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  private notifyMultiTrackRequiresAuth(): void {
    this.openInfoDialog({
      title: 'Acceso limitado',
      message: 'Solo los usuarios registrados pueden cargar más de un GPX a la vez. Ve a la pantalla principal para iniciar sesión o registrarte.',
      confirmLabel: 'Ir a inicio',
      cancelLabel: 'Seguir aquí'
    }).then(result => {
      if (result === 'confirm') {
        this.router.navigate(['/']);
      }
    });
  }

  private showEventsAuthNotice(): void {
    if (this.eventsNoticeShown) return;
    this.eventsNoticeShown = true;
    this.router.navigate(['/']);
    this.openInfoDialog({
      title: 'Función para usuarios registrados',
      message: 'La sección de eventos y rankings es exclusiva para usuarios registrados. Inicia sesión o regístrate desde la pantalla principal.',
      confirmLabel: 'OK'
    });
  }

  private ensureEventsAccess(): boolean {
    if (this.isAuthenticated) return true;
    this.showEventsAuthNotice();
    return false;
  }

  getEventLocation(event: RaceEvent): string {
    const parts = [event.population, event.autonomousCommunity].filter(Boolean);
    return parts.join(' • ');
  }

  getEventLogoBg(event: any): string {
    const raw = event?.logoBlob; // ajusta el campo
    if (!raw) return 'none';

    // Si ya viene como data URL completa, úsala tal cual
    const dataUrl = raw.startsWith('data:image/')
      ? raw
      : `data:image/png;base64,${raw.replace(/\s/g, '')}`;

    return `url("${dataUrl}")`;
}

  getEventLogo(event: RaceEvent): string {
    if (event.logoBlob) {
      if (event.logoBlob.startsWith('data:image/')) return event.logoBlob;
      return this.buildDataUrl(event.logoBlob, event.logoMime || 'image/jpeg');
    }
    return 'assets/no-image.svg';
  }

  private buildDataUrl(content: string, mime = 'image/png'): string {
    return `data:${mime};base64,${(content || '').replace(/\s/g, '')}`;
  }

  private async buildEventVisuals(events: RaceEvent[]): Promise<void> {
    for (const event of events) {
      await this.prepareEventVisuals(event);
    }
  }

  private updateEventVisuals(eventId: number, visuals: EventVisuals): void {
    this.eventVisuals = { ...this.eventVisuals, [eventId]: visuals };
  }

  private async prepareEventVisuals(event: RaceEvent): Promise<void> {
    const gpxData = await this.resolveMasterGpxContent(event);
    if (!gpxData) {
      this.updateEventVisuals(event.id, { profile: null, trackPath: null, mapTileUrl: null });
      return;
    }

    const points = this.parseTrackPointsFromString(gpxData);
    if (!points.length) {
      this.updateEventVisuals(event.id, { profile: null, trackPath: null, mapTileUrl: null });
      return;
    }

    const profile = this.buildProfileVisual(points);
    const trackPath = this.buildTrackPolyline(points);
    const mapTileUrl = this.buildStaticTileUrl(points);
    this.updateEventVisuals(event.id, { profile, trackPath, mapTileUrl });
  }

  private async resolveMasterGpxContent(event: RaceEvent): Promise<string | null> {
    const decodedMaster = this.decodeGpxContent(event.gpxMaster);
    if (decodedMaster && this.isValidGpxData(decodedMaster)) {
      return decodedMaster;
    }

    const firstTrack = event.tracks?.[0];
    if (firstTrack?.gpxData && this.isValidGpxData(firstTrack.gpxData)) {
      return firstTrack.gpxData;
    }
    if (firstTrack?.gpxAsset) {
      try {
        const data = await firstValueFrom(this.http.get(firstTrack.gpxAsset, { responseType: 'text' }));
        if (this.isValidGpxData(data)) return data;
      } catch { /* ignore */ }
    }
    return null;
  }

  private decodeGpxContent(raw?: string | null): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed.includes('<')) return trimmed;
    const base64 = trimmed.startsWith('data:') ? trimmed.split(',')[1] ?? '' : trimmed;
    try {
      return decodeURIComponent(escape(atob(base64.replace(/\s/g, ''))));
    } catch {
      try {
        return atob(base64.replace(/\s/g, ''));
      } catch {
        return null;
      }
    }
  }

  private parseTrackPointsFromString(gpxData: string): TrackPoint[] {
    try {
      const parser = new DOMParser();
      const gpx = parser.parseFromString(gpxData, 'application/xml');
      const trkpts = Array.from(gpx.getElementsByTagName('trkpt'));
      if (gpx.getElementsByTagName('parsererror').length || !trkpts.length) return [];
      return trkpts.map(pt => ({
        lat: parseFloat(pt.getAttribute('lat') || '0'),
        lon: parseFloat(pt.getAttribute('lon') || '0'),
        ele: parseFloat(pt.getElementsByTagName('ele')[0]?.textContent || '0'),
        time: pt.getElementsByTagName('time')[0]?.textContent || '',
        hr: pt.getElementsByTagName('ns3:hr')[0] ? parseInt(pt.getElementsByTagName('ns3:hr')[0].textContent || '0') : null
      })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    } catch {
      return [];
    }
  }

  private buildProfileVisual(points: TrackPoint[], width = this.profileWidth, height = this.profileHeight): ProfileVisual | null {
    if (!points.length) return null;

    const elevations = points.map(p => p.ele ?? 0);
    const distances = this.buildCumulativeDistances(points);
    const initialEle = elevations[0];
    const minEle = Math.min(...elevations);
    const maxEle = Math.max(...elevations);
    const eleRange = Math.max(1, maxEle - minEle);
    const totalDistance = distances[distances.length - 1];
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);

    const pointsStr = elevations.map((ele, idx) => {
      const x = (distances[idx] / Math.max(1, totalDistance)) * safeWidth;
      const y = safeHeight - ((ele - minEle) / eleRange) * safeHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const gridLinesY = [0.25, 0.5, 0.75].map(ratio => safeHeight - ratio * safeHeight);

    return {
      points: pointsStr,
      gridLinesY,
      stats: {
        initialElevation: initialEle,
        maxElevation: maxEle,
        distanceKm: totalDistance / 1000
      }
    };
  }

  private buildCumulativeDistances(points: TrackPoint[]): number[] {
    const distances: number[] = [0];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const current = points[i];
      const delta = this.calculateDistance(prev.lat, prev.lon, current.lat, current.lon);
      distances.push(distances[i - 1] + delta);
    }
    return distances;
  }

  private buildTrackPolyline(points: TrackPoint[], width = 320, height = 240): string | null {
    if (!points.length) return null;
    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const latRange = Math.max(1e-6, maxLat - minLat);
    const lonRange = Math.max(1e-6, maxLon - minLon);
    const padding = 10;
    const innerWidth = Math.max(1, width - padding * 2);
    const innerHeight = Math.max(1, height - padding * 2);

    return points.map(point => {
      const x = ((point.lon - minLon) / lonRange) * innerWidth + padding;
      const y = innerHeight - ((point.lat - minLat) / latRange) * innerHeight + padding;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  private buildStaticTileUrl(points: TrackPoint[], zoomHint = 13): string | null {
    if (!points.length) return null;

    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const latRange = maxLat - minLat;
    const lonRange = maxLon - minLon;

    const maxRange = Math.max(latRange, lonRange);
    let zoom = zoomHint;
    if (maxRange > 1) zoom = 8;
    else if (maxRange > 0.5) zoom = 10;
    else if (maxRange > 0.2) zoom = 11;
    else if (maxRange > 0.1) zoom = 12;
    else if (maxRange > 0.05) zoom = 13;
    else if (maxRange > 0.02) zoom = 14;
    else if (maxRange > 0.01) zoom = 15;
    else zoom = 16;

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;
    const tileCoords = this.latLonToTile(centerLat, centerLon, zoom);
    const streetTile = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${zoom}/${tileCoords.y}/${tileCoords.x}`;
    const imageryTile = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileCoords.y}/${tileCoords.x}`;
    const prefersImagery = zoom >= 15 && maxRange <= 0.02;

    return prefersImagery ? imageryTile : streetTile;
  }

  private latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
    const latRad = (lat * Math.PI) / 180;
    const n = 2 ** zoom;
    const x = Math.floor(((lon + 180) / 360) * n);
    const y = Math.floor(
      (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
    );
    return { x, y };
  }

  getMapBackgroundStyle(eventId: number): Record<string, string> {
    const tileUrl = this.eventVisuals[eventId]?.mapTileUrl;
    if (!tileUrl) return {};
    return { '--event-map-url': `url('${tileUrl}')` };
  }

  nextEvent(manual = false): void {
    if (!this.events.length) return;
    this.carouselIndex = (this.carouselIndex + 1) % this.events.length;
    this.syncSelectionWithCarousel();
    if (manual) this.restartCarouselTimer();
  }

  prevEvent(manual = false): void {
    if (!this.events.length) return;
    this.carouselIndex = (this.carouselIndex - 1 + this.events.length) % this.events.length;
    this.syncSelectionWithCarousel();
    if (manual) this.restartCarouselTimer();
  }

  goToEvent(index: number): void {
    if (index < 0 || index >= this.events.length) return;
    this.carouselIndex = index;
    this.syncSelectionWithCarousel();
    this.restartCarouselTimer();
  }

  handleCarouselSelection(eventId: number): void {
    if (!this.ensureEventsAccess()) return;
    this.selectEvent(eventId);
  }

  canUploadMasterGpx(event: RaceEvent): boolean {
    return this.isAuthenticated && event.createdBy === this.userId;
  }

  promptMasterGpxUpload(eventId: number): void {
    if (!this.ensureEventsAccess()) return;
    this.pendingMasterUploadEventId = eventId;
    if (this.masterGpxInputRef?.nativeElement) {
      this.masterGpxInputRef.nativeElement.click();
    }
  }

  async onMasterGpxFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.gpx')) {
      this.showMessage('Selecciona un archivo GPX válido.');
      this.resetMasterGpxInput();
      return;
    }

    const gpxData = await this.readFileAsText(file);
    if (!this.isValidGpxData(gpxData)) {
      this.showMessage('El archivo no es un GPX válido.');
      this.resetMasterGpxInput();
      return;
    }

    const targetEventId = this.pendingMasterUploadEventId;
    if (!targetEventId) {
      this.resetMasterGpxInput();
      return;
    }

    this.eventService.updateGpxMaster(targetEventId, {
      gpxMaster: this.encodeGpxContent(gpxData),
      gpxMasterFileName: file.name
    }).subscribe({
      next: updated => {
        this.events = this.events.map(ev => ev.id === updated.id ? updated : ev);
        void this.prepareEventVisuals(updated);
        this.resetMasterGpxInput();
      },
      error: () => {
        this.showMessage('No se pudo guardar el track maestro.');
        this.resetMasterGpxInput();
      }
    });
  }

  private resetMasterGpxInput(): void {
    this.pendingMasterUploadEventId = null;
    if (this.masterGpxInputRef?.nativeElement) {
      this.masterGpxInputRef.nativeElement.value = '';
    }
  }

  private encodeGpxContent(content: string): string {
    try {
      return btoa(unescape(encodeURIComponent(content)));
    } catch {
      return btoa(content);
    }
  }

  restartCarouselTimer(): void {
    this.clearCarouselTimer();
    if (!this.events.length) return;
    this.carouselTimer = setInterval(() => this.nextEvent(), this.carouselIntervalMs);
  }

  private clearCarouselTimer(): void {
    if (this.carouselTimer) {
      clearInterval(this.carouselTimer);
      this.carouselTimer = undefined;
    }
  }

  private syncCarouselIndex(): void {
    if (!this.events.length) {
      this.carouselIndex = 0;
      return;
    }
    const selectedIndex = this.selectedEventId ? this.events.findIndex(e => e.id === this.selectedEventId) : -1;
    if (selectedIndex >= 0) {
      this.carouselIndex = selectedIndex;
    } else if (this.carouselIndex >= this.events.length) {
      this.carouselIndex = 0;
    }
  }

  private syncSelectionWithCarousel(): void {
    if (!this.events.length || !this.isAuthenticated) return;
    const event = this.events[this.carouselIndex];
    if (!event || this.selectedEventId === event.id) return;
    this.selectEvent(event.id);
  }

  openEventSearch(): void {
    if (!this.ensureEventsAccess()) return;
    this.closeEventMenu();
    const dialogRef = this.dialog.open<EventSearchDialogComponent, EventSearchDialogData, EventSearchDialogResult>(
      EventSearchDialogComponent,
      {
        width: '960px',
        height: '700px',
        data: {
          events: this.events,
          selectedEventId: this.selectedEventId,
          selectedModalityId: this.selectedModalityId
        }
      }
    );

    dialogRef.afterClosed().subscribe(result => {
      if (result?.eventId) {
        this.selectMode('events');
        this.selectEvent(result.eventId, result.modalityId || undefined);
      }
    });
  }

  openCreateEventDialog(): void {
    if (!this.ensureEventsAccess()) return;
    this.closeEventMenu();
    const dialogRef = this.dialog.open<EventCreateDialogComponent, undefined, EventCreateDialogResult>(
      EventCreateDialogComponent,
      {
        width: '720px'
      }
    );

    dialogRef.afterClosed().subscribe(result => {
      if (!result?.event) return;
      const payload: CreateEventPayload = { ...result.event, createdBy: this.userId };
      console.log("CreateEventPayload: ", payload)
      this.eventService.createEvent(payload).subscribe({
        next: created => {
          this.selectMode('events');
          this.selectEvent(created.id);
        },
        error: () => this.showMessage('No se pudo crear el evento en el servidor.')
      });
    });
  }

  openUploadTrackDialog(): void {
    if (!this.ensureEventsAccess()) return;
    if (!this.events.length) {
      this.showMessage('No hay eventos disponibles para subir un track.');
      return;
    }
    this.closeEventMenu();
    const dialogRef = this.dialog.open<EventTrackUploadDialogComponent, EventTrackUploadDialogData, EventTrackUploadDialogResult>(
      EventTrackUploadDialogComponent,
      {
        width: '720px',
        data: {
          events: this.events,
          categories: this.categories,
          bikeTypes: this.bikeTypes,
          defaultEventId: this.selectedEventId ?? this.eventUpload.eventId,
          defaultModalityId: this.selectedModalityId ?? this.eventUpload.modalityId,
          defaultCategory: this.eventUpload.category,
          defaultBikeType: this.eventUpload.bikeType,
          defaultDistanceKm: this.eventUpload.distanceKm
        }
      }
    );

    dialogRef.afterClosed().subscribe(result => {
      if (!result) return;
      const uploadPayload: EventTrackUploadPayload = {
        eventId: result.eventId,
        modalityId: result.modalityId ?? null,
        category: result.category,
        bikeType: result.bikeType,
        distanceKm: result.distanceKm,
        file: result.file
      };
      this.eventUpload = {
        ...this.eventUpload,
        eventId: uploadPayload.eventId,
        modalityId: uploadPayload.modalityId,
        category: uploadPayload.category,
        bikeType: uploadPayload.bikeType,
        distanceKm: uploadPayload.distanceKm,
        file: null
      };
      this.selectMode('events');
      this.selectEvent(uploadPayload.eventId!, uploadPayload.modalityId || undefined);
      this.uploadTrackToEvent(uploadPayload);
    });
  }

  startBackgroundMusic() {
    const audio = document.getElementById('background-music') as HTMLAudioElement;
    if (audio) {
      audio.play().catch(error => {
        console.error('Error playing background music:', error);
      });
    }
  }

  triggerFileDialog(): void {
    this.fileInputRef?.nativeElement.click();
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.handleFiles(input.files);
    if (input) {
      input.value = '';
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(): void {
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
    this.handleFiles(event.dataTransfer?.files ?? null);
  }

  private handleFiles(fileList: FileList | null): void {
    if (!fileList || fileList.length === 0) return;

    const gpxFiles = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.gpx'));
    if (!gpxFiles.length) return;

    if (!this.isAuthenticated) {
      const incomingCount = gpxFiles.length;
      if (incomingCount > 1 || this.tracks.length >= 1 || this.tracks.length + incomingCount > 1) {
        this.notifyMultiTrackRequiresAuth();
        return;
      }
    }

    const maxAllowed = this.isAuthenticated ? this.maxTracks : 1;
    const availableSlots = maxAllowed - this.tracks.length;
    if (availableSlots <= 0) {
      if (!this.isAuthenticated) {
        this.notifyMultiTrackRequiresAuth();
      } else {
        this.showMessage(`Puedes cargar como máximo ${this.maxTracks} archivos GPX a la vez.`, 'Límite de tracks');
      }
      return;
    }

    const files = gpxFiles.slice(0, availableSlots);
    if (!files.length) return;

    files.forEach(file => this.onFileSelected(file));
  }

  private onFileSelected(file: File): void {
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      const gpxData = e.target.result as string;
      await this.parseGPX(gpxData, file);
    };
    reader.readAsText(file);
  }

  private parseGpxData(gpxData: string, fileName: string, colorIndex: number): ParsedTrackResult {
    const parser = new DOMParser();
    const gpx = parser.parseFromString(gpxData, 'application/xml');
    const trkpts = gpx.getElementsByTagName('trkpt');

    if (gpx.getElementsByTagName('parsererror').length || trkpts.length === 0) {
      throw new Error('GPX inválido');
    }

    let totalAscent = 0;
    let previousElevation: number | null = null;
    const elevations: number[] = [];
    let firstTime: string | null = null;
    let lastTime: string | null = null;

    for (let i = 0; i < trkpts.length; i++) {
      const ele = parseFloat(trkpts[i].getElementsByTagName('ele')[0]?.textContent || '0');
      const time = trkpts[i].getElementsByTagName('time')[0]?.textContent || '';
      const hrElement = trkpts[i].getElementsByTagName('ns3:hr')[0];
      const hr = hrElement ? parseInt(hrElement.textContent || '0') : null;

      if (i === 0) {
        firstTime = time;
      }
      lastTime = time || lastTime;

      elevations.push(ele);
      if (previousElevation !== null) {
        const elevationDiff = ele - previousElevation;
        if (elevationDiff > 0) {
          totalAscent += elevationDiff;
        }
      }
      previousElevation = ele;
    }

    const date = firstTime ? new Date(firstTime).toLocaleString() : new Date().toLocaleString();
    const durationSeconds = (firstTime && lastTime)
      ? Math.max(0, (new Date(lastTime).getTime() - new Date(firstTime).getTime()) / 1000)
      : 0;

    const track: LoadedTrack = {
      name: fileName.replace(/\.[^.]+$/, ''),
      color: this.pickColor(colorIndex),
      fileName,
      details: {
        date,
        distance: this.calculateTotalDistance(trkpts),
        ascent: totalAscent
      },
      data: {
        elevations,
        trkpts: Array.from(trkpts).map((trkpt: Element) => ({
          lat: parseFloat(trkpt.getAttribute('lat')!),
          lon: parseFloat(trkpt.getAttribute('lon')!),
          ele: parseFloat(trkpt.getElementsByTagName('ele')[0]?.textContent || '0'),
          time: trkpt.getElementsByTagName('time')[0]?.textContent || '',
          hr: trkpt.getElementsByTagName('ns3:hr')[0] ? parseInt(trkpt.getElementsByTagName('ns3:hr')[0].textContent || '0') : null
        }))
      }
    };

    return { track, durationSeconds };
  }

  private isValidGpxData(gpxData: string): boolean {
    try {
      const parser = new DOMParser();
      const gpx = parser.parseFromString(gpxData, 'application/xml');
      return !gpx.getElementsByTagName('parsererror').length && gpx.getElementsByTagName('trkpt').length > 0;
    } catch {
      return false;
    }
  }

  private calculateActiveDurationSeconds(trkpts: TrackPoint[], pauseThresholdMs = 30_000): number {
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

  private calculateTotalDurationSeconds(trkpts: TrackPoint[]): number {
    if (!trkpts?.length) return 0;
    const times = trkpts
      .map(p => new Date(p.time).getTime())
      .filter(t => Number.isFinite(t));

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

  private formatDurationAsLocalTime(totalSeconds: number): string {
    const total = Math.max(0, Math.round(totalSeconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  async parseGPX(gpxData: string, file: File): Promise<void> {
    let parsed: ParsedTrackResult;
    try {
      parsed = this.parseGpxData(gpxData, file.name, this.tracks.length);
    } catch {
      this.showMessage('El archivo no es un GPX válido.');
      return;
    }

    const { track } = parsed;

    const updatedTracks = [...this.tracks, track];
    if (await this.shouldAbortBecauseOfRouteMismatch(updatedTracks)) {
      return;
    }

    this.tracks = updatedTracks;
  }

  private async readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  private calculateTotalDistance(trkpts: HTMLCollectionOf<Element>): number {
    let totalDistance = 0;
    for (let i = 1; i < trkpts.length; i++) {
      const prevLat = parseFloat(trkpts[i - 1].getAttribute('lat')!);
      const prevLon = parseFloat(trkpts[i - 1].getAttribute('lon')!);
      const lat = parseFloat(trkpts[i].getAttribute('lat')!);
      const lon = parseFloat(trkpts[i].getAttribute('lon')!);
      totalDistance += this.calculateDistance(prevLat, prevLon, lat, lon);
    }
    return totalDistance / 1000;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private pickColor(index: number): string {
    const palette = ['#3b82f6', '#f87171', '#22c55e', '#f59e0b', '#a855f7'];
    return palette[index % palette.length];
  }

  private async shouldAbortBecauseOfRouteMismatch(tracks: LoadedTrack[]): Promise<boolean> {
    if (tracks.length < 2) return false;

    const base = tracks[0].data.trkpts;
    let minOverlap = 1;

    for (let i = 1; i < tracks.length; i++) {
      const overlap = this.computeOverlapRatio(base, tracks[i].data.trkpts);
      minOverlap = Math.min(minOverlap, overlap);
    }

    if (minOverlap < this.overlapThreshold) {
      const percentage = Math.round(minOverlap * 100);
      const continueAnyway = await firstValueFrom(
        this.dialog.open(RouteMismatchDialogComponent, {
          data: { percentage }
        }).afterClosed()
      );
      return !continueAnyway;
    }

    return false;
  }

  private computeOverlapRatio(reference: TrackPoint[], candidate: TrackPoint[]): number {
    if (!reference.length || !candidate.length) return 0;

    const sampleStepCandidate = Math.max(1, Math.floor(candidate.length / 500));
    const sampleStepReference = Math.max(1, Math.floor(reference.length / 1000));

    let matches = 0;
    let total = 0;

    for (let i = 0; i < candidate.length; i += sampleStepCandidate) {
      total++;
      if (this.isPointCloseToTrack(candidate[i], reference, sampleStepReference, this.overlapProximityMeters)) {
        matches++;
      }
    }

    return total > 0 ? matches / total : 0;
  }

  private isPointCloseToTrack(point: TrackPoint, track: TrackPoint[], step: number, thresholdMeters: number): boolean {
    for (let i = 0; i < track.length; i += step) {
      const candidate = track[i];
      const distance = this.calculateDistance(point.lat, point.lon, candidate.lat, candidate.lon);
      if (distance <= thresholdMeters) return true;
    }
    return false;
  }

  private applyMetadata(meta: TrackMetadataDialogResult): void {
    this.tracks = this.tracks.map((track, index) => ({
      ...track,
      name: meta.names[index]?.trim() || track.name,
      color: meta.colors[index] || track.color
    }));
  }

  borrarFichero(index: number): void {
    this.tracks = this.tracks.filter((_, i) => i !== index);
  }

  tracksCargados(): boolean {
    return this.tracks.length > 0;
  }

  iniciarVisualizacion(): void {
    if (!this.tracksCargados()) {
      this.showMessage('Carga al menos un track.');
      return;
    }

    const metadataDefaults: TrackMetadataDialogResult = {
      names: this.tracks.map((t, i) => t.name || `Track ${i + 1}`),
      colors: this.tracks.map((t, i) => t.color || this.pickColor(i))
    };

    this.dialog.open<TrackMetadataDialogComponent, TrackMetadataDialogResult, TrackMetadataDialogResult>(
      TrackMetadataDialogComponent,
      {
        width: '520px',
        data: metadataDefaults
      }
    )
      .afterClosed()
      .subscribe((meta) => {
        if (!meta) return;
        this.applyMetadata(meta);
        this.abrirCuadroConfiguracion(meta);
      });
  }

  private abrirCuadroConfiguracion(meta: TrackMetadataDialogResult): void {
    const permitirAdversarioVirtual = this.tracks.length > 0;

    const tracksPayload = this.tracks.map(track => ({
      trkpts: track.data.trkpts.map(p => ({
        lat: p.lat, lon: p.lon, ele: p.ele, time: p.time, hr: p.hr ?? null
      }))
    }));

    const namesPayload = meta.names.map((n, i) => n?.trim() || `Track ${i + 1}`);
    const colorsPayload = meta.colors.map((c, i) => c || this.pickColor(i));

    this.dialog.open<DialogoConfiguracionComponent, Partial<DialogoConfiguracionData>, DialogoConfiguracionData>(
      DialogoConfiguracionComponent,
      {
        width: '520px',
        data: {
          eliminarPausasLargas: false,
          anadirLogoTitulos: false,
          activarMusica: true,
          grabarAnimacion: false,
          relacionAspectoGrabacion: '16:9',
          permitirAdversarioVirtual,
          modoVisualizacion: 'general',
        }
      }
    )
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;

        let tracksFinal = tracksPayload;
        let namesFinal = namesPayload;
        let colorsFinal = colorsPayload.slice();

        if (permitirAdversarioVirtual && result.incluirAdversarioVirtual) {
          const objetivoSegundos = this.parsearTiempoObjetivo(result.tiempoAdversarioVirtual ?? '00:45');
          const virtualTrack = this.generarAdversarioVirtual(this.tracks[0], objetivoSegundos);
          if (virtualTrack) {
            tracksFinal = [...tracksPayload, virtualTrack];
            namesFinal = [...namesPayload, 'Adversario virtual'];
            colorsFinal = [...colorsFinal, '#ff006e'];
          }
        }

        const afterLogo = (logoDataUrl: string | null) => {
          const payload = {
            names: namesFinal,
            colors: colorsFinal,
            tracks: tracksFinal,
            logo: logoDataUrl,
            rmstops: !!result.eliminarPausasLargas,
            activarMusica: !!result.activarMusica,
            grabarAnimacion: !!result.grabarAnimacion,
            relacionAspectoGrabacion: result.relacionAspectoGrabacion ?? '16:9',
            modoVisualizacion: result.modoVisualizacion ?? 'general'
          };
          sessionStorage.setItem('gpxViewerPayload', JSON.stringify(payload));

          this.router.navigate(['/map'], { queryParams: { s: '1' } });
        };

        if (result.anadirLogoTitulos) {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/png,image/jpeg,image/webp';
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return afterLogo(null);
            try {
              const dataUrl = await this.downscaleImageFromFile(file, 122, 'image/png', 0.92, false);
              afterLogo(dataUrl);
            } catch { afterLogo(null); }
          };
          input.click();
        } else {
          afterLogo(null);
        }

      });
  }

  private downscaleImageFromFile(
    file: File,
    targetHeight = 122,
    outputType: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
    quality = 0.9,
    allowUpscale = false
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = allowUpscale
            ? (targetHeight / img.naturalHeight)
            : Math.min(1, targetHeight / img.naturalHeight);

          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));

          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;

          const ctx = canvas.getContext('2d')!;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);

          URL.revokeObjectURL(url);
          const q = (outputType === 'image/jpeg' || outputType === 'image/webp') ? quality : undefined;
          resolve(canvas.toDataURL(outputType, q));
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  private parsearTiempoObjetivo(valor: string): number {
    const partes = valor.split(':');
    const horas = parseInt(partes[0] ?? '0', 10);
    const minutos = parseInt(partes[1] ?? '0', 10);
    const total = Math.max(0, (horas * 60 + minutos));
    return total > 0 ? total * 60 : 45 * 60;
  }

  private velocidadSegunPendiente(porcentaje: number): number {
    if (porcentaje > 6) return 10;
    if (porcentaje > 2) return 12;
    if (porcentaje > -2) return 14;
    if (porcentaje > -6) return 16;
    return 18;
  }

  private generarAdversarioVirtual(track: LoadedTrack, objetivoSegundos: number): { trkpts: any[] } | null {
    if (!track?.data?.trkpts || track.data.trkpts.length < 2) return null;

    const puntos = track.data.trkpts as any[];
    const segmentos = [] as { distancia: number; pendiente: number }[];

    for (let i = 1; i < puntos.length; i++) {
      const dist = this.calculateDistance(puntos[i - 1].lat, puntos[i - 1].lon, puntos[i].lat, puntos[i].lon);
      const deltaEle = (puntos[i].ele ?? 0) - (puntos[i - 1].ele ?? 0);
      const pendiente = dist > 0 ? (deltaEle / dist) * 100 : 0;
      segmentos.push({ distancia: dist, pendiente });
    }

    if (!segmentos.length) return null;

    const windowSize = 5;
    const velocidadesSuavizadasMs = segmentos.map((seg, idx, arr) => {
      const half = Math.floor(windowSize / 2);
      let sum = 0, count = 0;
      for (let j = Math.max(0, idx - half); j <= Math.min(arr.length - 1, idx + half); j++) {
        const velKmh = this.velocidadSegunPendiente(arr[j].pendiente);
        sum += velKmh / 3.6;
        count++;
      }
      const media = count > 0 ? sum / count : this.velocidadSegunPendiente(seg.pendiente) / 3.6;
      return Math.max(0.5, media);
    });

    const baseDuraciones = segmentos.map((seg, idx) => seg.distancia / velocidadesSuavizadasMs[idx]);
    const totalBase = baseDuraciones.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(totalBase) || totalBase <= 0) return null;
    const factorEscala = Math.max(0.1, objetivoSegundos / totalBase);

    const inicio = new Date(puntos[0].time ?? Date.now());
    let tiempoActual = isNaN(inicio.getTime()) ? Date.now() : inicio.getTime();

    const nuevosPuntos = [
      { ...puntos[0], time: new Date(tiempoActual).toISOString(), hr: puntos[0].hr ?? null }
    ];

    for (let i = 1; i < puntos.length; i++) {
      const duracionSegmento = baseDuraciones[i - 1] * factorEscala * 1000;
      tiempoActual += duracionSegmento;
      nuevosPuntos.push({
        ...puntos[i],
        time: new Date(tiempoActual).toISOString(),
        hr: puntos[i].hr ?? null
      });
    }

    return { trkpts: nuevosPuntos };
  }

  private validateEventUpload(upload: EventTrackUploadPayload): string | null {
    const selectedEvent = this.events.find(e => e.id === upload.eventId);
    if (!selectedEvent) {
      return 'El evento seleccionado no es válido.';
    }
    const nickname = this.personalNickname || this.authService.getSession()?.nickname || '';
    if (!nickname.trim()) {
      return 'No se pudo obtener tu nick para el ranking.';
    }
    if (!upload.category) {
      return 'Selecciona tu categoría.';
    }
    if (!upload.bikeType) {
      return 'Selecciona tu tipo de bicicleta.';
    }
    const distanceKm = Number(upload.distanceKm);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      return 'Añade la distancia en kilómetros del recorrido.';
    }
    if (!upload.file) {
      return 'Selecciona un archivo GPX.';
    }
    return null;
  }

  async uploadTrackToEvent(upload: EventTrackUploadPayload): Promise<void> {
    if (!this.ensureEventsAccess()) return;
    const validationError = this.validateEventUpload(upload);
    if (validationError) {
      this.showMessage(validationError);
      return;
    }

    const nickname = (this.personalNickname || this.authService.getSession()?.nickname || '').trim();
    if (!nickname) {
      this.showMessage('No se pudo obtener tu nick para el ranking.');
      return;
    }
    const routeId = upload.eventId!;
    const event = this.events.find(e => e.id === routeId);
    const modalityId = upload.modalityId ?? this.selectedModalityId ?? event?.modalities?.[0]?.id ?? null;
    const distanceKm = Number(upload.distanceKm);
    const gpxData = await this.readFileAsText(upload.file!);

    if (!this.isValidGpxData(gpxData)) {
      this.showMessage('El archivo no es un GPX válido.');
      return;
    }

    let parsed: ParsedTrackResult;
    try {
      parsed = this.parseGpxData(gpxData, upload.file!.name, 0);
    } catch (error) {
      this.showMessage('El archivo no es un GPX válido.');
      return;
    }

    const { track, durationSeconds } = parsed;
    const activeDurationSeconds = this.calculateActiveDurationSeconds(track.data.trkpts) || durationSeconds;
    const totalDurationSeconds = this.calculateTotalDurationSeconds(track.data.trkpts) || durationSeconds;
    if (!activeDurationSeconds) {
      this.showMessage('No se pudo calcular la duración del track.');
      return;
    }
    const timeSeconds = Math.max(1, Math.round(activeDurationSeconds));
    const tiempoReal = Math.max(1, Math.round(totalDurationSeconds || timeSeconds));

    const newTrack: CreateTrackPayload = {
      routeId,
      nickname,
      category: upload.category,
      bikeType: upload.bikeType,
      modalityId,
      timeSeconds,
      tiempoReal,
      distanceKm: Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : track.details.distance,
      ascent: track.details.ascent,
      routeXml: gpxData,
      fileName: upload.file!.name,
      duracionRecorrido: this.formatDurationAsLocalTime(timeSeconds),
      uploadedAt: new Date().toISOString(),
      createdBy: this.userId
    };

    this.eventService.addTrack(newTrack).subscribe({
      next: created => {
        this.latestUploadedTrackId = created.id;
        this.personalNickname = nickname;
        this.refreshPersonalHistory();
        this.selectedComparisonIds.add(created.id);
      },
      error: () => this.showMessage('No se pudo subir el track al evento.')
    });
  }

  async animateSelectedTracks(): Promise<void> {
    if (!this.ensureEventsAccess()) return;
    const event = this.selectedEvent;
    if (!event) return;

    const selectedIds = Array.from(this.selectedComparisonIds).slice(0, this.maxComparison);
    if (!selectedIds.length) {
      this.showMessage('Selecciona al menos un track para comparar.');
      return;
    }

    const loaded: LoadedTrack[] = [];
    for (let i = 0; i < selectedIds.length; i++) {
      const trackRef = event.tracks.find(t => t.id === selectedIds[i]);
      if (!trackRef) continue;
      const built = await this.ensureLoadedTrackFromEventTrack(trackRef, i);
      if (built) {
        loaded.push({
          ...built,
          color: this.pickColor(i),
          name: `${trackRef.nickname} • ${this.findModalityName(trackRef.modalityId)}`
        });
      }
    }

    if (!loaded.length) {
      this.showMessage('No se pudieron cargar los tracks seleccionados.');
      return;
    }

    this.tracks = loaded;
    this.iniciarVisualizacion();
  }

  toggleComparisonSelection(trackId: number): void {
    if (!this.ensureEventsAccess()) return;
    if (this.selectedComparisonIds.has(trackId)) {
      this.selectedComparisonIds.delete(trackId);
      return;
    }
    if (this.selectedComparisonIds.size >= this.maxComparison) return;
    this.selectedComparisonIds.add(trackId);
  }

  canDeleteTrack(track: EventTrack): boolean {
    if (track.createdBy === this.userId) return true;
    return Boolean(!track.createdBy && this.personalNickname && track.nickname === this.personalNickname);
  }

  deleteTrack(trackId: number, eventId?: number): void {
    if (!this.ensureEventsAccess()) return;
    const targetEventId = eventId ?? this.selectedEventId;
    if (!targetEventId) return;
    const event = this.events.find(e => e.id === targetEventId);
    const track = event?.tracks.find(t => t.id === trackId);
    if (!track || !this.canDeleteTrack(track)) return;

    this.eventService.removeTrack(targetEventId, trackId, this.userId).subscribe(removed => {
      if (!removed) return;
      this.selectedComparisonIds.delete(trackId);
      if (this.latestUploadedTrackId === trackId) {
        this.latestUploadedTrackId = null;
      }
      this.refreshPersonalHistory();
    });
  }

  get ranking(): EventTrack[] {
    const event = this.selectedEvent;
    if (!event) return [];
    const bestByNickname = new Map<string, EventTrack>();
    event.tracks.forEach(track => {
      const current = bestByNickname.get(track.nickname);
      if (!current || track.timeSeconds < current.timeSeconds) {
        bestByNickname.set(track.nickname, track);
      }
    });
    return Array.from(bestByNickname.values()).sort((a, b) => a.timeSeconds - b.timeSeconds);
  }

  get availableTracks(): EventTrack[] {
    return this.selectedEvent?.tracks ?? [];
  }

  getEventRanking(event: RaceEvent, limit = 3): EventTrack[] {
    const bestByNickname = new Map<string, EventTrack>();
    event.tracks.forEach(track => {
      const current = bestByNickname.get(track.nickname);
      if (!current || track.timeSeconds < current.timeSeconds) {
        bestByNickname.set(track.nickname, track);
      }
    });
    return Array.from(bestByNickname.values())
      .sort((a, b) => a.timeSeconds - b.timeSeconds)
      .slice(0, limit);
  }

  private refreshPersonalHistory(): void {
    const nickname = this.personalNickname;
    if (!nickname) {
      this.personalHistory = [];
      return;
    }
    const event = this.selectedEvent;
    if (!event) return;
    this.personalHistory = event.tracks
      .filter(t => t.nickname === nickname)
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  private loadRouteTrackTimes(routeId: number): void {
    this.eventService.getRouteTrackTimes(routeId).subscribe(times => {
      this.routeTrackTimes = (times || []).slice().sort((a, b) => a.tiempoReal - b.tiempoReal);
    });
  }

  async refreshUserTracks(): Promise<void> {
    if (!this.isAuthenticated) {
      this.userTracks = [];
      return;
    }
    this.userTracksLoading = true;
    try {
      const tracks = await firstValueFrom(this.eventService.getMyTracks());
      const eventsById = new Map<number, RaceEvent>(this.events.map(event => [event.id, event]));
      const rows = tracks.map(track => this.toUserTrackRow(track, eventsById));
      await this.fillMissingUserTrackLocations(rows);
      this.userTracks = rows;
    } catch {
      this.showMessage('No se pudieron cargar tus tracks. Inténtalo de nuevo más tarde.');
      this.userTracks = [];
    } finally {
      this.userTracksLoading = false;
    }
  }

  private toUserTrackRow(track: EventTrack, eventsById: Map<number, RaceEvent>): UserTrackRow {
    const routeIdValue = track.routeId === null || track.routeId === undefined ? null : this.toNumber(track.routeId, 0);
    const routeId = routeIdValue && routeIdValue > 0 ? routeIdValue : null;
    const event = routeId ? eventsById.get(routeId) : undefined;
    return {
      trackId: track.id,
      routeId,
      eventName: event?.name ?? '-',
      year: this.resolveTrackYear(track, event),
      autonomousCommunity: event?.autonomousCommunity ?? null,
      province: event?.province ?? null,
      population: event?.population ?? null,
      distanceKm: this.toNumber(track.distanceKm),
      timeSeconds: this.toNumber(track.timeSeconds),
      totalTimeSeconds: this.resolveTotalTimeSeconds(track),
      gpxData: track.gpxData,
      gpxAsset: track.gpxAsset,
      fileName: track.fileName,
      canDelete: this.canDeleteTrack(track),
      title: (track as any).title ?? null,
      description: (track as any).description ?? null
    };
  }

  private async fillMissingUserTrackLocations(rows: UserTrackRow[]): Promise<void> {
    const cache = new Map<string, { population: string | null; autonomousCommunity: string | null; province: string | null }>();
    for (const row of rows) {
      if (row.routeId && (row.population || row.autonomousCommunity || row.province)) continue;
      if (row.population && row.autonomousCommunity && row.province) continue;
      const point = await this.extractFirstPointForRow(row);
      if (!point) continue;
      const key = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
      let location = cache.get(key);
      if (!location) {
        location = await this.reverseGeocode(point.lat, point.lon);
        if (location) {
          cache.set(key, location);
        }
      }
      if (!location) continue;
      row.population = row.population || location.population;
      row.autonomousCommunity = row.autonomousCommunity || location.autonomousCommunity;
      row.province = row.province || location.province;
    }
  }

  private async extractFirstPointForRow(row: UserTrackRow): Promise<{ lat: number; lon: number } | null> {
    const gpx = await this.resolveGpxContentForRow(row);
    if (!gpx) return null;
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(gpx, 'application/xml');
      const trkpt = xml.querySelector('trkpt');
      if (!trkpt) return null;
      const lat = parseFloat(trkpt.getAttribute('lat') || '');
      const lon = parseFloat(trkpt.getAttribute('lon') || '');
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { lat, lon };
    } catch {
      return null;
    }
  }

  private async reverseGeocode(lat: number, lon: number): Promise<{ population: string | null; autonomousCommunity: string | null; province: string | null } | undefined> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1`;
      const result: any = await firstValueFrom(this.http.get(url, { headers: { Accept: 'application/json' } }));
      const address = result?.address || {};
      return {
        population: address.village || address.town || address.city || null,
        autonomousCommunity: address.state || null,
        province: address.province || address.county || null
      };
    } catch {
      return undefined;
    }
  }

  formatDurationHms(seconds: number): string {
    const total = Math.max(0, Math.round(seconds || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  isDownloadingTrack(row: UserTrackRow): boolean {
    return this.downloadingTracks.has(row.trackId);
  }

  isDeletingTrack(row: UserTrackRow): boolean {
    return this.deletingTracks.has(row.trackId);
  }

  async downloadUserTrack(row: UserTrackRow): Promise<void> {
    if (this.isDownloadingTrack(row)) return;
    this.downloadingTracks.add(row.trackId);
    try {
      const gpx = await this.resolveGpxContentForRow(row);
      if (!gpx) {
        this.showMessage('No se pudo preparar la descarga del GPX.');
        return;
      }
      const blob = new Blob([gpx], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = row.fileName || `${row.eventName}-${row.year || 'track'}.gpx`;
      link.href = url;
      link.download = safeName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } finally {
      this.downloadingTracks.delete(row.trackId);
    }
  }

  async animateUserTrack(row: UserTrackRow): Promise<void> {
    const gpx = await this.resolveGpxContentForRow(row);
    if (!gpx) {
      this.showMessage('No se pudo cargar el track para animarlo.');
      return;
    }
    if (!this.isValidGpxData(gpx)) {
      this.showMessage('El archivo GPX no es válido.');
      return;
    }
    try {
      const { track } = this.parseGpxData(gpx, row.fileName || row.eventName || 'Track', 0);
      track.name = row.title || track.name;
      this.tracks = [{ ...track, color: this.pickColor(0) }];
      this.iniciarVisualizacion();
    } catch {
      this.showMessage('No se pudo procesar el track.');
    }
  }

  async confirmDeleteUserTrack(row: UserTrackRow): Promise<void> {
    if (!row.canDelete) {
      this.showMessage('Solo puedes eliminar tracks que hayas subido tú.');
      return;
    }
    const decision = await this.openInfoDialog({
      title: 'Eliminar track',
      message: '¿Seguro que quieres eliminar este track? Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar'
    });
    if (decision !== 'confirm') return;
    this.deleteUserTrack(row);
  }

  private deleteUserTrack(row: UserTrackRow): void {
    if (this.isDeletingTrack(row)) return;
    this.deletingTracks.add(row.trackId);
    this.eventService.removeTrack(row.routeId, row.trackId, this.userId).subscribe(removed => {
      this.deletingTracks.delete(row.trackId);
      if (!removed) {
        this.showMessage('No se pudo eliminar el track.');
        return;
      }
      this.userTracks = this.userTracks.filter(current => current.trackId !== row.trackId);
    });
  }

  private async resolveGpxContentForRow(row: UserTrackRow): Promise<string | null> {
    const decoded = this.decodeGpxContent(row.gpxData);
    if (decoded) return decoded;

    if (row.gpxAsset) {
      try {
        return await firstValueFrom(this.http.get(row.gpxAsset, { responseType: 'text' }));
      } catch {
        /* ignore */
      }
    }

    try {
      const gpxFile: TrackGpxFile | null = await firstValueFrom(this.eventService.getTrackGpx(row.trackId));
      if (gpxFile?.routeXml) {
        row.fileName = gpxFile.fileName || row.fileName;
        return this.decodeGpxContent(gpxFile.routeXml);
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  async openStandaloneUploadDialog(): Promise<void> {
    if (!this.isAuthenticated) {
      this.showMessage('Inicia sesión para subir tus tracks.');
      return;
    }
    const dialogRef = this.dialog.open<StandaloneTrackUploadDialogComponent, any, StandaloneTrackUploadResult | undefined>(
      StandaloneTrackUploadDialogComponent,
      { width: '520px' }
    );
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;
    await this.uploadStandaloneTrack(result);
  }

  private async uploadStandaloneTrack(result: StandaloneTrackUploadResult): Promise<void> {
    if (this.standaloneUploadInProgress) return;
    const nickname = (this.personalNickname || this.authService.getSession()?.nickname || this.authService.getSession()?.email || '').trim();
    if (!nickname) {
      this.showMessage('No se pudo obtener tu usuario para asignar el track.');
      return;
    }
    let gpxData: string;
    try {
      gpxData = await this.readFileAsText(result.file);
    } catch {
      this.showMessage('No se pudo leer el archivo GPX.');
      return;
    }
    if (!this.isValidGpxData(gpxData)) {
      this.showMessage('El archivo no es un GPX válido.');
      return;
    }
    let parsed: ParsedTrackResult;
    try {
      parsed = this.parseGpxData(gpxData, result.file.name, 0);
    } catch {
      this.showMessage('El archivo no es un GPX válido.');
      return;
    }

    const { track, durationSeconds } = parsed;
    const activeDurationSeconds = this.calculateActiveDurationSeconds(track.data.trkpts) || durationSeconds;
    const totalDurationSeconds = this.calculateTotalDurationSeconds(track.data.trkpts) || durationSeconds;
    const timeSeconds = Math.max(1, Math.round(activeDurationSeconds || durationSeconds || 1));
    const tiempoReal = Math.max(1, Math.round(totalDurationSeconds || activeDurationSeconds || durationSeconds || 1));

    const payload: CreateTrackPayload = {
      routeId: null,
      nickname,
      category: null,
      bikeType: 'MTB',
      modalityId: null,
      timeSeconds,
      tiempoReal,
      distanceKm: Number.isFinite(track.details.distance) ? track.details.distance : 0,
      ascent: track.details.ascent,
      routeXml: gpxData,
      fileName: result.file.name,
      uploadedAt: new Date().toISOString(),
      duracionRecorrido: this.formatDurationAsLocalTime(timeSeconds),
      createdBy: this.userId,
      title: result.title
    };

    this.standaloneUploadInProgress = true;
    this.eventService.addTrack(payload).subscribe({
      next: () => this.refreshUserTracks(),
      error: () => {
        this.showMessage('No se pudo subir el track.');
        this.standaloneUploadInProgress = false;
      },
      complete: () => { this.standaloneUploadInProgress = false; }
    });
  }

  formatTime(seconds: number): string {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const hh = hours ? `${hours}:` : '';
    const mm = hours ? String(minutes).padStart(2, '0') : minutes.toString();
    return `${hh}${mm}:${String(secs).padStart(2, '0')}`;
  }

  findModalityName(modalityId: number | null | undefined): string {
    return this.selectedEvent?.modalities.find(m => m.id === modalityId)?.name || 'Recorrido';
  }

  findModalityNameForEvent(event: RaceEvent, modalityId: number | null | undefined): string {
    return event.modalities.find(m => m.id === modalityId)?.name || 'Recorrido';
  }

  canDeleteSelectedEvent(): boolean {
    const event = this.selectedEvent;
    return Boolean(event && event.createdBy === this.userId && event.tracks.length === 0);
  }

  deleteSelectedEvent(): void {
    if (!this.ensureEventsAccess()) return;
    this.closeEventMenu();
    const eventId = this.selectedEventId;
    if (!eventId || !this.selectedEvent) return;
    if (!this.canDeleteSelectedEvent()) {
      this.showMessage('Solo puedes eliminar eventos que hayas creado y que no tengan tracks asociados.');
      return;
    }

    this.eventService.removeEvent(eventId, this.userId).subscribe(removed => {
      if (removed) {
        this.handleEventSelection(null);
      }
    });
  }

  private async ensureLoadedTrackFromEventTrack(track: EventTrack, colorIndex: number): Promise<LoadedTrack | null> {
    try {
      const gpxData = track.gpxData || (track.gpxAsset
        ? await firstValueFrom(this.http.get(track.gpxAsset, { responseType: 'text' }))
        : null);
      if (!gpxData) return null;
      const { track: loadedTrack } = this.parseGpxData(gpxData, track.fileName || track.nickname, colorIndex);
      loadedTrack.name = `${track.nickname} (${track.category})`;
      return loadedTrack;
    } catch {
      return null;
    }
  }

  closeEventMenu(): void {
    this.eventMenuTrigger?.closeMenu();
    this.eventMenuOpen = false;
  }

  async openMyTracksDialog(): Promise<void> {
    if (!this.ensureEventsAccess()) return;
    this.closeEventMenu();
    const rows = await this.buildMyTrackRows();
    this.dialog.open<MyTracksDialogComponent, any>(MyTracksDialogComponent, {
      width: '1080px',
      data: {
        tracks: rows,
        userId: this.userId,
        personalNickname: this.personalNickname
      }
    });
  }

  private async buildMyTrackRows(): Promise<MyTrackRow[]> {
    try {
      const tracks = await firstValueFrom(this.eventService.getMyTracks());
      const eventsById = new Map<number, RaceEvent>(this.events.map(event => [event.id, event]));

      return tracks.map(track => {
        const event = track.routeId ? eventsById.get(track.routeId) : undefined;
        return {
          eventId: track.routeId ?? 0,
          trackId: track.id,
          eventName: event?.name ?? '—',
          year: this.resolveTrackYear(track, event),
          population: event?.population ?? null,
          distanceKm: this.toNumber(track.distanceKm),
          timeSeconds: this.toNumber(track.timeSeconds),
          totalTimeSeconds: this.resolveTotalTimeSeconds(track),
          gpxData: track.gpxData,
          gpxAsset: track.gpxAsset,
          fileName: track.fileName,
          canDelete: this.canDeleteTrack(track)
        };
      });
    } catch {
      this.showMessage('No se pudieron cargar tus tracks. Inténtalo de nuevo más tarde.');
      return [];
    }
  }

  private resolveTotalTimeSeconds(track: EventTrack): number {
    const tiempoReal = track.tiempoReal;
    if (tiempoReal !== undefined && tiempoReal !== null) {
      const parsed = Number(tiempoReal);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    const parsedDuration = this.parseLocalTimeToSeconds(track.duracionRecorrido);
    if (parsedDuration !== null) {
      return parsedDuration;
    }

    return this.toNumber(track.timeSeconds);
  }

  private resolveTrackYear(track: EventTrack, event?: RaceEvent): number {
    if (event?.year) {
      return event.year;
    }
    const uploadedAt = track.uploadedAt;
    if (uploadedAt) {
      const parsed = new Date(uploadedAt);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.getFullYear();
      }
    }
    return 0;
  }

  private parseLocalTimeToSeconds(duration?: string | null): number | null {
    if (!duration) return null;
    const parts = duration.split(':').map(part => Number(part));
    if (parts.some(part => Number.isNaN(part))) return null;
    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      return (hours * 3600) + (minutes * 60) + seconds;
    }
    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return (minutes * 60) + seconds;
    }
    return null;
  }

  private toNumber(value: any, fallback = 0): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }
}
