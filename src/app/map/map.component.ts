import { Component, OnInit, AfterViewInit, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import * as L from 'leaflet';
import { RecorderService } from '../recording/recorder.service';
import { PlanService } from '../services/plan.service';
import { MapPayloadTransferService } from '../services/map-payload-transfer.service';
import { EventTrack, RaceEvent } from '../interfaces/events';
import { environment } from '../../environments/environment';
import { ProfileVisual, TrackPointWithElevation, buildCumulativeDistances, buildProfileVisual } from '../utils/profile-visual';

interface TrackPoint { lat: number; lon: number; ele: number; time: string; }
interface TPx extends TrackPoint { t: number; }

interface PauseInterval {
  startAbs: number;
  endAbs: number;
  durationMs: number;
  anchor: { lat: number; lon: number };
}

interface TrackMeta {
  name: string;
  color: string;
  raw: TrackPoint[];
  sanitized: TPx[];
  full?: L.Polyline;
  prog?: L.Polyline;
  mark?: L.Marker;
  startMark?: L.CircleMarker;
  endMark?: L.CircleMarker;
  hoverMark?: L.CircleMarker;
  ticks?: L.LayerGroup;
  pauses: PauseInterval[];
  pauseLayer?: L.LayerGroup;
  cursor: number;
  nextTickRel: number;
  finalAdded: boolean;
  distances: number[];
  totalDistance: number;
  has: boolean;
}

interface RankingEntry {
  name: string;
  color: string;
  durationMs: number;
  medal?: 'gold' | 'silver' | 'bronze';
}

interface BaseLayerOption {
  id: string;
  name: string;
  url: string;
  attribution: string;
  maxZoom?: number;
}

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements OnInit, AfterViewInit {

  private map!: L.Map;
  private renderer!: L.Canvas;

  logoDataUrl: string | null = null;
  removeStops = false;  // quitar paradas largas
  markLongPauses = true;
  pauseThresholdSeconds = 30;

  showStartOverlay = true;
  countdownValue: string | null = null;
  private startArmed = false;
  private autoStartRequested = false;
  private autoStartDone = false;
  private audio!: HTMLAudioElement;
  private hasTracksReady = false;
  private musicEnabled = true;
  private countdownSoundEnabled = true;
  private recordingEnabled = false;
  private recordingAspect: '16:9' | '9:16' = '16:9';
  private countdownTimer: number | null = null;
  private countdownInProgress = false;
  private startSequenceLaunched = false;
  private countdownAudio!: HTMLAudioElement;
  isVerticalViewport = false;
  isMobileViewport = false;
  showRanking = false;
  ranking: RankingEntry[] = [];

  private visualizationMode: 'general' | 'zoomCabeza' = 'general';
  private zoomPhase: 'focus' | 'overview' = 'focus';
  private lastZoomSwitch = 0;
  private readonly overviewDurationMs = 2000;
  private maxRaceDurationMs = 0;
  private midOverviewShown = false;
  private midOverviewActive = false;
  private firstFinisherSeen = false;
  private lastLeaderPan = 0;
  private leaderAnimationRunning = false;
  private readonly leaderPanIntervalMs = 450;
  private readonly leaderZoomLevel = 17;
  private readonly leaderFlyDurationMs = 650;
  private readonly generalViewZoomScale = 0.75;
  private readonly generalViewZoomScaleVertical = 0.65;
  private readonly ghostOpacity = 0.4;
  private readonly ghostWeight = 3;
  private readonly progressOpacity = 0.95;
  private readonly zoomPlaybackFactor = 0.3;
  private readonly zoomPanSlowdownFactor = 2;
  private readonly fallbackUniformSpeedMs = 5; // velocidad constante para tracks sin tiempo
  private readonly defaultColors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6'];
  private lastLeaderTarget: L.LatLng | null = null;
  private allTracksBounds: L.LatLngBounds | null = null;
  private readonly maxReasonableSpeedMs = 45; // ~162 km/h, evita descartar puntos válidos en coche

  trackMetas: TrackMeta[] = [];
  private relMs = 0;
  private rafId = 0;
  private started = false;

  showUniformSpeedDialog = false;

  profileEnabled = true;
  profileVisual: ProfileVisual | null = null;
  profileWidth = 960;
  profileHeight = 180;
  profileCursorX = 0;
  profileTrackColor = '#f97316';
  mobileProfileVisible = true;
  private profileTrackIndex = 0;
  private profileDragging = false;
  private profilePointerId: number | null = null;

  // Ambos terminan aprox. en este tiempo de reproducción
  private desiredDurationSec = 30;
  private replaySpeed = 1;

  // Ticks dinámicos cada 30 min
  private readonly TICK_STEP_MS = 30 * 60 * 1000;

  colors: string[] = [];
  names: string[] = [];

  baseLayerOptions: BaseLayerOption[] = [
    {
      id: 'satellite',
      name: 'Satélite (Esri)',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maxZoom: 19,
      attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
    },
    {
      id: 'terrain',
      name: 'Relieve (OpenTopoMap)',
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      maxZoom: 17,
      attribution: '© OpenTopoMap (CC-BY-SA)'
    },
    {
      id: 'street',
      name: 'Callejero (OpenStreetMap)',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }
  ];
  selectedBaseLayerId = this.baseLayerOptions.find((option) => option.id === 'street')?.id ?? this.baseLayerOptions[0]?.id ?? '';
  private baseLayer: L.TileLayer | null = null;
  viewOnly = false;
  editMode = false;
  isSavingEdits = false;
  editStatusMessage: string | null = null;
  private editStatusTimeout: number | null = null;
  private editableTrackId: number | null = null;
  private originalTrackPoints: TrackPoint[] | null = null;
  private originalRouteXml: string | null = null;
  private originalPointsSnapshot: string | null = null;
  private editPointsLayer: L.LayerGroup | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public rec: RecorderService,
    private http: HttpClient,
    private planService: PlanService,
    private mapPayloadTransfer: MapPayloadTransferService) { }

  goBack(): void {
    const origin = this.route.snapshot.queryParamMap.get('from');
    const folderId = this.route.snapshot.queryParamMap.get('folderId');

    if (origin === 'events') {
      this.router.navigate(['/events']);
      return;
    }

    if (origin === 'routes') {
      this.router.navigate(['/load'], { queryParams: { mode: 'routes' } });
      return;
    }

    if (origin === 'plan') {
      const parsedFolderId = folderId ? Number(folderId) : NaN;
      if (Number.isFinite(parsedFolderId) && parsedFolderId > 0) {
        this.router.navigate(['/plan'], { queryParams: { folderId: parsedFolderId } });
      } else {
        this.router.navigate(['/plan']);
      }
      return;
    }

    this.router.navigate(['/']);
  }


  private readPayloadFromNavigationState(): any | null {
    const fromCurrentNavigation = this.router.getCurrentNavigation()?.extras.state?.['gpxViewerPayload'] ?? null;
    if (fromCurrentNavigation) {
      return fromCurrentNavigation;
    }

    const fromHistoryState = (typeof window !== 'undefined' ? window.history.state?.gpxViewerPayload : null) ?? null;
    return fromHistoryState;
  }

  private readPayloadFromWindowName(): any | null {
    if (typeof window === 'undefined' || typeof window.name !== 'string') {
      return null;
    }

    const prefix = 'gpxViewerPayload:';
    if (!window.name.startsWith(prefix)) {
      return null;
    }

    const rawPayload = window.name.slice(prefix.length);
    if (!rawPayload) {
      return null;
    }

    try {
      return JSON.parse(decodeURIComponent(rawPayload));
    } catch {
      return null;
    }
  }

  private clearWindowNamePayload(): void {
    if (typeof window === 'undefined' || typeof window.name !== 'string') {
      return;
    }
    if (window.name.startsWith('gpxViewerPayload:')) {
      window.name = '';
    }
  }

  private hydrateRemoveStopsFlag(): void {
    let payload: any = this.readPayloadFromNavigationState();
    if (!payload) {
      payload = this.mapPayloadTransfer.get();
    }
    if (!payload) {
      try { payload = JSON.parse(sessionStorage.getItem('gpxViewerPayload') || 'null'); } catch { payload = null; }
    }
    if (!payload) {
      payload = this.readPayloadFromWindowName();
    }

    if (payload && typeof payload.rmstops !== 'undefined') {
      this.removeStops = !!payload.rmstops;
      return;
    }

    const rmstopsParam = this.route.snapshot.queryParamMap.get('rmstops');
    if (rmstopsParam !== null) {
      this.removeStops = (rmstopsParam === '1' || rmstopsParam === 'true');
    }
  }

  // ---------- util ----------
  private getVideoDimensions(): { width: number; height: number } {
    return this.recordingAspect === '9:16'
      ? { width: 1440, height: 2560 }
      : { width: 2560, height: 1440 };
  }

  private roundCoord(x: number, decimals = 6): number {
    const f = 10 ** decimals;
    return Math.round(x * f) / f;
  }

  private isCoordValid(lat: number, lon: number): boolean {
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  }
  private ms(s: string): number { const n = new Date(s).getTime(); return Number.isFinite(n) ? n : NaN; }
  private hav(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3, toRad = Math.PI / 180;
    const φ1 = lat1 * toRad, φ2 = lat2 * toRad, dφ = (lat2 - lat1) * toRad, dλ = (lon2 - lon1) * toRad;
    const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  private speedMs(p0: TPx, p1: TPx): number {
    const dt = (p1.t - p0.t) / 1000;
    return dt > 0 ? this.hav(p0.lat, p0.lon, p1.lat, p1.lon) / dt : 0;
  }
  private interp(p0: TPx, p1: TPx, tAbs: number): [number, number] {
    if (p1.t === p0.t) return [p1.lat, p1.lon];
    const f = Math.max(0, Math.min(1, (tAbs - p0.t) / (p1.t - p0.t)));
    return [p0.lat + f * (p1.lat - p0.lat), p0.lon + f * (p1.lon - p0.lon)];
  }

  // Posición a un tiempo absoluto SIN mutar cursores (búsqueda binaria)
  private positionAtAbs(track: TPx[], tAbs: number): [number, number] {
    if (track.length === 0) return [0, 0];
    if (tAbs <= track[0].t) return [track[0].lat, track[0].lon];
    if (tAbs >= track[track.length - 1].t) {
      const last = track[track.length - 1];
      return [last.lat, last.lon];
    }
    let lo = 0, hi = track.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (track[mid].t <= tAbs) lo = mid + 1; else hi = mid;
    }
    const i = Math.max(0, lo - 1);
    return this.interp(track[i], track[i + 1], tAbs);
  }

  // avanza puntos reales y devuelve posición interpolada actual (animación)
  private positionAt(track: TPx[], tAbs: number, cur: { i: number }): [number, number] {
    while (cur.i + 1 < track.length && track[cur.i + 1].t <= tAbs) cur.i++;
    const i = cur.i;
    if (i >= track.length - 1) {
      const last = track[track.length - 1];
      return [last.lat, last.lon];
    }
    return this.interp(track[i], track[i + 1], tAbs);
  }

  // limpia: ordena y filtra saltos >60 km/h
  private sanitize(arr: TrackPoint[]): TPx[] {
    const rounded = arr.map(p => ({
      ...p,
      lat: this.roundCoord(p.lat),
      lon: this.roundCoord(p.lon),
    }));
    const validCoords = rounded.filter(p => this.isCoordValid(p.lat, p.lon));
    const parsed = validCoords.map(p => ({ ...p, t: this.ms(p.time) }));
    const withTime = parsed.filter(p => Number.isFinite(p.t));

    if (withTime.length >= 2) {
      const xs = withTime.sort((a, b) => a.t - b.t);
      const out: TPx[] = [xs[0]];
      for (let i = 1; i < xs.length; i++) {
        const prev = out[out.length - 1], cur = xs[i];
        if (this.speedMs(prev, cur) <= this.maxReasonableSpeedMs) out.push(cur);
      }
      return out;
    }

    if (parsed.length < 2) return [];

    // Sin tiempos válidos: generamos una línea de tiempo uniforme basada en distancia
    this.showUniformSpeedDialog = true;
    const uniform: TPx[] = [];
    let cumulativeMs = 0;

    for (let i = 0; i < parsed.length; i++) {
      const cur = parsed[i];
      if (i === 0) {
        uniform.push({ ...cur, t: 0 });
        continue;
      }
      const prev = uniform[uniform.length - 1];
      const dist = this.hav(prev.lat, prev.lon, cur.lat, cur.lon);
      const dt = dist / this.fallbackUniformSpeedMs * 1000;
      cumulativeMs += Number.isFinite(dt) ? dt : 0;
      uniform.push({ ...cur, t: cumulativeMs });
    }

    return uniform;
  }

  private parseTrackPointsFromGpx(gpxData: string): TrackPoint[] {
    try {
      const parser = new DOMParser();
      const gpx = parser.parseFromString(gpxData, 'application/xml');
      const trkpts = Array.from(gpx.getElementsByTagName('trkpt'));

      return trkpts
        .map(trkpt => ({
          lat: parseFloat(trkpt.getAttribute('lat') || '0'),
          lon: parseFloat(trkpt.getAttribute('lon') || '0'),
          ele: parseFloat(trkpt.getElementsByTagName('ele')[0]?.textContent || '0'),
          time: trkpt.getElementsByTagName('time')[0]?.textContent || ''
        }))
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    } catch {
      return [];
    }
  }

  private buildMetas(names: string[], colors: string[], tracks: any[]): TrackMeta[] {
    return tracks.map((track, index) => ({
      name: names[index] ?? `Track ${index + 1}`,
      color: colors[index] ?? this.defaultColors[index % this.defaultColors.length],
      raw: (track?.trkpts ?? []) as TrackPoint[],
      sanitized: [],
      pauses: [],
      cursor: 0,
      nextTickRel: this.TICK_STEP_MS,
      finalAdded: false,
      distances: [],
      totalDistance: 0,
      has: false,
    }));
  }

  private applySanitization(): void {
    this.trackMetas = this.trackMetas.map((meta) => {
      let sanitized = this.sanitize(meta.raw);
      let pauses: PauseInterval[] = [];
      const pauseThresholdMs = Math.max(1, this.pauseThresholdSeconds) * 1000;

      if (this.removeStops) {
        const result = this.removeStopsAdaptive(sanitized, pauseThresholdMs);
        sanitized = result.track;
        pauses = this.markLongPauses ? result.pauses.filter(p => p.durationMs >= pauseThresholdMs) : [];
      } else if (this.markLongPauses) {
        pauses = this.removeStopsAdaptive(sanitized, pauseThresholdMs).pauses
          .filter(p => p.durationMs >= pauseThresholdMs);
      }
      const distances = sanitized.length ? buildCumulativeDistances(sanitized as TrackPointWithElevation[]) : [];
      const totalDistance = distances[distances.length - 1] ?? 0;
      return { ...meta, sanitized, pauses, distances, totalDistance };
    });

    this.updateProfileVisual();
    this.updateEditPointsLayer();

    if (this.map) {
      this.attachTrackLayers();
      if (this.viewOnly) {
        this.renderStaticTracks();
      } else {
        this.hasTracksReady = this.startIfReady();
        this.startCountdown();
        void this.autoStartIfRequested();
      }
    }
  }

  private updateProfileVisual(): void {
    if (!this.profileEnabled) {
      this.profileVisual = null;
      this.profileCursorX = 0;
      this.profileTrackColor = '#f97316';
      return;
    }

    const meta = this.trackMetas[this.profileTrackIndex];
    this.profileTrackColor = meta?.color ?? '#f97316';
    if (!meta || !meta.sanitized.length || meta.totalDistance <= 0) {
      this.profileVisual = null;
      this.profileCursorX = 0;
      return;
    }

    this.profileVisual = buildProfileVisual(
      meta.sanitized as TrackPointWithElevation[],
      this.profileWidth,
      this.profileHeight
    );
    this.profileCursorX = 0;
  }

  private updateProfileCursor(meta: TrackMeta, tAbs: number): void {
    if (!this.profileEnabled || !this.profileVisual || meta.totalDistance <= 0 || !meta.distances.length) return;
    const distance = this.distanceAtCursor(meta, tAbs);
    this.profileCursorX = this.computeProfileCursorPosition(distance, meta.totalDistance);
  }

  private distanceAtCursor(meta: TrackMeta, tAbs: number): number {
    if (!meta.distances.length || meta.sanitized.length < 2) return 0;
    const lastPoint = meta.sanitized[meta.sanitized.length - 1];
    if (tAbs >= lastPoint.t) return meta.totalDistance;

    const i = Math.min(meta.cursor, meta.sanitized.length - 2);
    const p0 = meta.sanitized[i];
    const p1 = meta.sanitized[i + 1];
    const d0 = meta.distances[i];
    const d1 = meta.distances[i + 1] ?? d0;
    const denom = p1.t - p0.t;
    const f = denom > 0 ? Math.max(0, Math.min(1, (tAbs - p0.t) / denom)) : 0;
    return d0 + (d1 - d0) * f;
  }

  private computeProfileCursorPosition(distance: number, totalDistance: number): number {
    const safeTotal = Math.max(0, totalDistance);
    const clamped = Math.max(0, Math.min(distance, safeTotal));
    if (safeTotal === 0) return 0;
    const ratio = clamped / safeTotal;
    return ratio * this.profileWidth;
  }

  onProfileHover(event: MouseEvent): void {
    if (!this.viewOnly || !this.profileVisual) return;
    if (this.profileDragging) return;
    this.updateProfileFromPointer(event);
  }

  onProfilePointerDown(event: PointerEvent): void {
    if (!this.viewOnly || !this.profileVisual) return;
    this.profileDragging = true;
    this.profilePointerId = event.pointerId;
    const target = event.currentTarget as SVGElement | null;
    if (target) {
      target.setPointerCapture(event.pointerId);
    }
    this.updateProfileFromPointer(event);
  }

  onProfilePointerMove(event: PointerEvent): void {
    if (!this.profileDragging) return;
    if (this.profilePointerId !== null && event.pointerId !== this.profilePointerId) return;
    this.updateProfileFromPointer(event);
  }

  onProfilePointerUp(event: PointerEvent): void {
    if (!this.profileDragging) return;
    if (this.profilePointerId !== null && event.pointerId !== this.profilePointerId) return;
    const target = event.currentTarget as SVGElement | null;
    if (target && this.profilePointerId !== null) {
      target.releasePointerCapture(this.profilePointerId);
    }
    this.profileDragging = false;
    this.profilePointerId = null;
  }

  onProfilePointerCancel(event: PointerEvent): void {
    if (!this.profileDragging) return;
    if (this.profilePointerId !== null && event.pointerId !== this.profilePointerId) return;
    this.profileDragging = false;
    this.profilePointerId = null;
  }

  private updateProfileFromPointer(event: MouseEvent | PointerEvent): void {
    const meta = this.trackMetas[this.profileTrackIndex];
    if (!meta || !meta.has || !meta.sanitized.length || !meta.distances.length || meta.totalDistance <= 0) return;
    if (!this.map || !meta.hoverMark) return;

    const target = event.currentTarget as SVGElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const clamped = Math.max(0, Math.min(offsetX, rect.width));
    const ratio = rect.width ? clamped / rect.width : 0;
    this.syncProfilePosition(meta, ratio);
  }

  private syncProfilePosition(meta: TrackMeta, ratio: number): void {
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const distance = clampedRatio * meta.totalDistance;
    this.profileCursorX = clampedRatio * this.profileWidth;
    const position = this.positionAtDistance(meta, distance);
    meta.hoverMark?.setLatLng(position).addTo(this.map);
  }

  onProfileHoverEnd(): void {
    if (!this.viewOnly || this.profileDragging) return;
  }

  private positionAtDistance(meta: TrackMeta, distance: number): L.LatLng {
    const total = meta.totalDistance;
    if (!meta.distances.length || !meta.sanitized.length || total <= 0) {
      return L.latLng(0, 0);
    }
    const clamped = Math.max(0, Math.min(distance, total));
    let index = meta.distances.findIndex(value => value >= clamped);
    if (index <= 0) {
      const start = meta.sanitized[0];
      return L.latLng(start.lat, start.lon);
    }
    if (index === -1) {
      const last = meta.sanitized[meta.sanitized.length - 1];
      return L.latLng(last.lat, last.lon);
    }

    const prevIndex = index - 1;
    const d0 = meta.distances[prevIndex];
    const d1 = meta.distances[index];
    const p0 = meta.sanitized[prevIndex];
    const p1 = meta.sanitized[index];
    const span = d1 - d0;
    const ratio = span > 0 ? (clamped - d0) / span : 0;
    return L.latLng(
      p0.lat + (p1.lat - p0.lat) * ratio,
      p0.lon + (p1.lon - p0.lon) * ratio
    );
  }

  private loadTracksFromSessionOrQuery(): void {
    this.resetPlaybackState();
    let payload: any = this.readPayloadFromNavigationState();
    if (!payload) {
      payload = this.mapPayloadTransfer.get();
    }
    if (!payload) {
      try { payload = JSON.parse(sessionStorage.getItem('gpxViewerPayload') || 'null'); } catch { payload = null; }
    }
    if (!payload) {
      payload = this.readPayloadFromWindowName();
    }

    if (payload) {
      this.mapPayloadTransfer.clear();
      this.clearWindowNamePayload();
      this.viewOnly = !!payload.viewOnly;
      this.editableTrackId = Number.isFinite(Number(payload.trackId)) ? Number(payload.trackId) : null;
      this.originalRouteXml = typeof payload.routeXml === 'string' ? payload.routeXml : null;
      this.names = Array.isArray(payload.names) ? payload.names : [];
      this.colors = Array.isArray(payload.colors) ? payload.colors : [];
      const trks = Array.isArray(payload.tracks) ? payload.tracks : [];
      this.trackMetas = this.buildMetas(this.names, this.colors, trks);
      if (trks.length && Array.isArray(trks[0]?.trkpts)) {
        const originalPoints = trks[0].trkpts.map((point: TrackPoint) => ({ ...point }));
        this.originalTrackPoints = originalPoints;
        this.originalPointsSnapshot = this.serializeTrackPoints(originalPoints);
      }
      this.logoDataUrl = payload.logo ?? null;
      this.removeStops = !!payload.rmstops;
      this.markLongPauses = payload.marcarPausasLargas ?? this.markLongPauses;
      const thresholdFromPayload = Number(payload.umbralPausaSegundos);
      this.pauseThresholdSeconds = Number.isFinite(thresholdFromPayload) && thresholdFromPayload >= 1
        ? Math.trunc(thresholdFromPayload)
        : this.pauseThresholdSeconds;
      this.musicEnabled = payload.activarMusica ?? true;
      this.recordingEnabled = !!payload.grabarAnimacion;
      if (payload.relacionAspectoGrabacion === '9:16') {
        this.recordingAspect = '9:16';
      }
      this.visualizationMode = payload.modoVisualizacion === 'zoomCabeza' ? 'zoomCabeza' : 'general';
      this.profileEnabled = payload.mostrarPerfil ?? true;
      this.mobileProfileVisible = this.profileEnabled;
      this.isVerticalViewport = this.recordingAspect === '9:16';
      if (this.viewOnly) {
        this.musicEnabled = false;
        this.countdownSoundEnabled = false;
        this.recordingEnabled = false;
      }
      this.applySanitization();
      return;
    }

    // Fallback (por si alguien entra directo a /map sin pasar por /load)
    this.route.queryParams.subscribe(params => {
      try { this.names = JSON.parse(params['names'] ?? '[]'); } catch { this.names = []; }
      try { this.colors = JSON.parse(params['colors'] ?? '[]'); } catch { this.colors = []; }
      let trks: any[] = [];
      try { trks = JSON.parse(params['tracks'] ?? '[]'); } catch { trks = []; }
      this.trackMetas = this.buildMetas(this.names, this.colors, trks);
      this.logoDataUrl = (params['logo'] ?? null) as string | null;
      this.removeStops = (params['rmstops'] === '1' || params['rmstops'] === 'true');
      this.markLongPauses = params['markpauses'] === undefined
        ? this.markLongPauses
        : (params['markpauses'] === '1' || params['markpauses'] === 'true');
      const thresholdFromQuery = Number(params['pausethreshold']);
      this.pauseThresholdSeconds = Number.isFinite(thresholdFromQuery) && thresholdFromQuery >= 1
        ? Math.trunc(thresholdFromQuery)
        : this.pauseThresholdSeconds;
      this.applySanitization();
    });
  }

  get canToggleMobileProfile(): boolean {
    return this.isMobileViewport && this.trackMetas.length === 1;
  }

  get shouldRenderProfileOverlay(): boolean {
    if (!this.profileEnabled) {
      return false;
    }
    if (!this.isMobileViewport) {
      return true;
    }
    return this.canToggleMobileProfile && this.mobileProfileVisible;
  }

  onMobileProfileToggle(checked: boolean): void {
    this.mobileProfileVisible = checked;
  }

  get canEditTrack(): boolean {
    return this.viewOnly
      && this.trackMetas.length === 1
      && Number.isFinite(this.editableTrackId ?? NaN)
      && !!this.originalRouteXml;
  }

  get hasEditChanges(): boolean {
    if (!this.canEditTrack) return false;
    const raw = this.trackMetas[0]?.raw ?? [];
    return this.serializeTrackPoints(raw) !== this.originalPointsSnapshot;
  }

  toggleEditMode(): void {
    if (!this.canEditTrack) return;
    this.editMode = !this.editMode;
    if (this.editMode) {
      this.setEditStatusMessage('Haz clic en un punto para eliminarlo.');
      this.updateEditPointsLayer();
    } else {
      this.clearEditStatusMessage();
      this.clearEditPointsLayer();
    }
  }

  cancelEdits(): void {
    if (!this.originalTrackPoints || !this.canEditTrack) {
      return;
    }
    this.updateTrackRaw(0, this.originalTrackPoints.map(point => ({ ...point })));
    this.applySanitization();
    this.editMode = false;
    this.setEditStatusMessage('Cambios descartados.');
    this.clearEditPointsLayer();
  }

  saveEdits(): void {
    if (!this.canEditTrack || !this.hasEditChanges || this.isSavingEdits) {
      return;
    }
    const raw = this.trackMetas[0]?.raw ?? [];
    if (raw.length < 2) {
      this.setEditStatusMessage('El track necesita al menos dos puntos.');
      return;
    }

    const gpxData = this.buildGpxFromPoints(raw, this.trackMetas[0]?.name ?? 'Track');
    if (!this.isValidGpxData(gpxData)) {
      this.setEditStatusMessage('El XML resultante no es un GPX válido.');
      return;
    }

    if (!this.editableTrackId) {
      this.setEditStatusMessage('No se encontró el identificador del track.');
      return;
    }

    this.isSavingEdits = true;
    this.setEditStatusMessage('Guardando cambios...');
    this.planService.updateTrack({ id: this.editableTrackId, routeXml: gpxData }).subscribe({
      next: () => {
        this.originalTrackPoints = raw.map(point => ({ ...point }));
        this.originalRouteXml = gpxData;
        this.originalPointsSnapshot = this.serializeTrackPoints(raw);
        this.editMode = false;
        this.setEditStatusMessage('Cambios guardados.');
        this.isSavingEdits = false;
        this.clearEditPointsLayer();
      },
      error: () => {
        this.isSavingEdits = false;
        this.setEditStatusMessage('No se pudo guardar el track.');
      }
    });
  }

  private handleMapClick(event: L.LeafletMouseEvent): void {
    if (!this.editMode || !this.canEditTrack) return;
    const meta = this.trackMetas[0];
    if (!meta?.raw?.length || meta.raw.length < 3) {
      this.setEditStatusMessage('El track necesita al menos dos puntos.');
      return;
    }

    const clickPoint = this.map.latLngToContainerPoint(event.latlng);
    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;

    meta.raw.forEach((point, index) => {
      const layerPoint = this.map.latLngToContainerPoint([point.lat, point.lon]);
      const distance = clickPoint.distanceTo(layerPoint);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    const thresholdPx = 12;
    if (closestIndex === -1 || closestDistance > thresholdPx) {
      this.setEditStatusMessage('Haz clic más cerca del punto que quieres eliminar.');
      return;
    }

    const updated = meta.raw.filter((_, index) => index !== closestIndex);
    if (updated.length < 2) {
      this.setEditStatusMessage('El track necesita al menos dos puntos.');
      return;
    }

    this.updateTrackRaw(0, updated);
    this.applySanitization();
    this.setEditStatusMessage('Punto eliminado.');
  }

  private updateEditPointsLayer(): void {
    if (!this.editPointsLayer || !this.map) return;
    if (!this.editMode || !this.canEditTrack) {
      this.clearEditPointsLayer();
      return;
    }
    this.editPointsLayer.clearLayers();
    const meta = this.trackMetas[0];
    if (!meta?.raw?.length) return;
    const points = this.buildEditPointMarkers(meta.raw);
    points.forEach(point => {
      const marker = L.circleMarker([point.lat, point.lon], {
        radius: 4,
        color: '#0f172a',
        weight: 1,
        fillColor: '#f8fafc',
        fillOpacity: 1,
        pane: 'overlayPane'
      });
      this.editPointsLayer?.addLayer(marker);
    });
  }

  private buildEditPointMarkers(points: TrackPoint[]): TrackPoint[] {
    const maxPoints = 300;
    if (points.length <= maxPoints) return points;
    const step = Math.ceil(points.length / maxPoints);
    const sampled = points.filter((_, index) => index % step === 0);
    const last = points[points.length - 1];
    if (sampled[sampled.length - 1] !== last) {
      sampled.push(last);
    }
    return sampled;
  }

  private clearEditPointsLayer(): void {
    this.editPointsLayer?.clearLayers();
  }

  private updateTrackRaw(index: number, raw: TrackPoint[]): void {
    this.trackMetas = this.trackMetas.map((meta, metaIndex) => {
      if (metaIndex !== index) return meta;
      return { ...meta, raw: raw.map(point => ({ ...point })) };
    });
  }

  private buildGpxFromPoints(points: TrackPoint[], name: string): string {
    const safeName = this.escapeXml(name || 'Track');
    const trkpts = points.map(point => {
      const lat = this.roundCoord(point.lat);
      const lon = this.roundCoord(point.lon);
      const ele = Number.isFinite(point.ele) ? `<ele>${point.ele}</ele>` : '';
      const time = point.time ? `<time>${this.escapeXml(point.time)}</time>` : '';
      return `<trkpt lat="${lat}" lon="${lon}">${ele}${time}</trkpt>`;
    }).join('');

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="gpx-map-viewer" xmlns="http://www.topografix.com/GPX/1/1">',
      `<trk><name>${safeName}</name><trkseg>${trkpts}</trkseg></trk>`,
      '</gpx>'
    ].join('');
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

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private serializeTrackPoints(points: TrackPoint[]): string {
    return JSON.stringify(points);
  }

  private setEditStatusMessage(message: string): void {
    this.editStatusMessage = message;
    if (this.editStatusTimeout !== null) {
      window.clearTimeout(this.editStatusTimeout);
    }
    this.editStatusTimeout = window.setTimeout(() => {
      this.editStatusMessage = null;
      this.editStatusTimeout = null;
    }, 3500);
  }

  private clearEditStatusMessage(): void {
    if (this.editStatusTimeout !== null) {
      window.clearTimeout(this.editStatusTimeout);
      this.editStatusTimeout = null;
    }
    this.editStatusMessage = null;
  }

  private loadTracksFromBackend(routeId: number): void {
    this.resetPlaybackState();
    this.http.get<RaceEvent>(`${environment.routesApiBase}/${routeId}`).subscribe({
      next: async (event) => {
        const normalizedEvent = this.normalizeEventFromBackend(event);
        await this.buildTrackMetasFromEvent(normalizedEvent);
      },
      error: () => this.loadTracksFromSessionOrQuery()
    });
  }

  private normalizeEventFromBackend(event: RaceEvent): RaceEvent {
    const distanceKm = event.distanceKm
      ?? (event as any).distance_km
      ?? (event as any).distante_km
      ?? null;

    return {
      ...event,
      distanceKm: Number.isFinite(Number(distanceKm)) ? Number(distanceKm) : null,
    };
  }

  private async buildTrackMetasFromEvent(event: RaceEvent): Promise<void> {
    const metas: TrackMeta[] = [];
    const names: string[] = [];
    const colors: string[] = [];

    for (let i = 0; i < event.tracks.length; i++) {
      const track = event.tracks[i];
      const raw = await this.resolveTrackPoints(track);
      if (!raw.length) continue;

      const color = this.defaultColors[i % this.defaultColors.length];
      const name = `${track.nickname}${track.category ? ` (${track.category})` : ''}`;

      metas.push({
        name,
        color,
        raw,
        sanitized: [],
        pauses: [],
        cursor: 0,
        nextTickRel: this.TICK_STEP_MS,
        finalAdded: false,
        distances: [],
        totalDistance: 0,
        has: false,
      });
      names.push(name);
      colors.push(color);
    }

    this.names = names;
    this.colors = colors;
    this.trackMetas = metas;
    this.logoDataUrl = event.logoBlob || this.buildLogoDataUrl(event.logoBlob, event.logoMime) || null;
    this.applySanitization();
  }

  private async resolveTrackPoints(track: EventTrack): Promise<TrackPoint[]> {
    const gpxData = await this.getGpxData(track);
    if (!gpxData) return [];
    return this.parseTrackPointsFromGpx(gpxData);
  }

  private async getGpxData(track: EventTrack): Promise<string | null> {
    if (track.gpxData) return track.gpxData;
    if (track.gpxAsset) {
      try {
        return await firstValueFrom(this.http.get(track.gpxAsset, { responseType: 'text' }));
      } catch {
        return null;
      }
    }
    return null;
  }

  private buildLogoDataUrl(logoBlob?: string | null, logoMime?: string | null): string | undefined {
    if (!logoBlob) return undefined;
    const mime = (logoMime || 'image/png').trim();
    return `data:${mime};base64,${logoBlob}`;
  }

  // Formatea duración (ms) como "X h Y min" (o "Y min", o "X h")
  private fmtHMin(ms: number): string {
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0 && m > 0) return `${h} h ${m} min`;
    if (h > 0) return `${h} h`;
    return `${m} min`;
  }

  private createTickLabel(content: string, isFinal = false): L.Marker {
    const icon = L.divIcon({
      className: 'tick-label-wrapper',
      html: `<div class="tick-label${isFinal ? ' tick-label-final' : ''}">${content}</div>`,
      iconSize: undefined,
      iconAnchor: [-8, 12],
    });

    return L.marker([0, 0], { icon, interactive: false });
  }

  // Añade un tick (punto + etiqueta) en un tiempo absoluto
  private addTickAtAbs(track: TPx[], absT: number, color: string, group: L.LayerGroup, startAbs: number): void {
    if (absT > track[track.length - 1].t) return;
    const [lat, lon] = this.positionAtAbs(track, absT);
    const dot = L.circleMarker([lat, lon], {
      radius: 4,
      color: color,
      weight: 2,
      fillColor: '#fff',
      fillOpacity: 0.9,
      pane: 'overlayPane'
    });

    const label = this.createTickLabel(this.fmtHMin(absT - startAbs));
    label.setLatLng([lat, lon]);
    group.addLayer(dot);
    group.addLayer(label);
  }

  // Marca FINAL (en el último punto) con duración total
  private addFinalTick(track: TPx[], color: string, group: L.LayerGroup, startAbs: number): void {
    if (track.length === 0) return;
    const endAbs = track[track.length - 1].t;
    const [lat, lon] = [track[track.length - 1].lat, track[track.length - 1].lon];

    const dot = L.circleMarker([lat, lon], {
      radius: 6,
      color: color,
      weight: 3,
      fillColor: '#fff',
      fillOpacity: 1,
      pane: 'overlayPane'
    });

    const label = this.createTickLabel(this.fmtHMin(endAbs - startAbs), true);
    label.setLatLng([lat, lon]);
    group.addLayer(dot);
    group.addLayer(label);
  }

  private addPauseMarker(pause: PauseInterval, color: string, group: L.LayerGroup): void {
    const minutes = pause.durationMs / 60000;
    if (minutes < 1) return;
    const label = `parada de ${Math.round(minutes)} min`;
    const icon = L.divIcon({
      className: 'pause-marker',
      html: `
        <div class="pause-label">${label}</div>
      `,
      iconSize: undefined,
      iconAnchor: [-8, 12]
    });

    const marker = L.marker([pause.anchor.lat, pause.anchor.lon], { icon, interactive: false });
    group.addLayer(marker);
  }

  private resetPlaybackState(): void {
    this.clearCountdownTimer();
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.audio?.pause();
    this.countdownAudio?.pause();
    if (this.audio) this.audio.currentTime = 0;
    if (this.countdownAudio) this.countdownAudio.currentTime = 0;

    this.showStartOverlay = true;
    this.countdownValue = null;
    this.startArmed = false;
    this.autoStartDone = false;
    this.hasTracksReady = false;
    this.countdownInProgress = false;
    this.startSequenceLaunched = false;
    this.showRanking = false;
    this.ranking = [];
    this.relMs = 0;
    this.started = false;
    this.viewOnly = false;
    this.zoomPhase = 'focus';
    this.lastZoomSwitch = 0;
    this.midOverviewShown = false;
    this.midOverviewActive = false;
    this.firstFinisherSeen = false;
    this.lastLeaderPan = 0;
    this.leaderAnimationRunning = false;
    this.lastLeaderTarget = null;
    this.allTracksBounds = null;
    this.maxRaceDurationMs = 0;
    this.profileCursorX = 0;

    this.clearTrackLayers();
    this.trackMetas = [];
  }

  private clearTrackLayers(): void {
    if (!this.map) return;

    this.trackMetas.forEach(meta => {
      if (meta.full) this.map.removeLayer(meta.full);
      if (meta.prog) this.map.removeLayer(meta.prog);
      if (meta.mark) this.map.removeLayer(meta.mark);
      if (meta.startMark) this.map.removeLayer(meta.startMark);
      if (meta.endMark) this.map.removeLayer(meta.endMark);
      if (meta.hoverMark) this.map.removeLayer(meta.hoverMark);
      if (meta.ticks) this.map.removeLayer(meta.ticks);
      if (meta.pauseLayer) this.map.removeLayer(meta.pauseLayer);
    });
  }

  private renderStaticTracks(): void {
    if (!this.map) return;

    const boundsPts: L.LatLng[] = [];

    this.trackMetas.forEach((meta) => {
      meta.has = meta.sanitized.length >= 2;
      meta.cursor = 0;
      meta.nextTickRel = this.TICK_STEP_MS;
      meta.finalAdded = false;

      if (meta.has && meta.full && meta.prog && meta.ticks && meta.startMark && meta.endMark && meta.hoverMark) {
        const latlngs = meta.sanitized.map(p => L.latLng(p.lat, p.lon));
        const startLatLng = latlngs[0];
        const endLatLng = latlngs[latlngs.length - 1];
        const endpointDistance = startLatLng.distanceTo(endLatLng);
        const useCombinedEndpointLabel = endpointDistance <= 15;

        meta.full.setLatLngs([]);
        meta.prog.setLatLngs(latlngs);
        meta.ticks.clearLayers();
        meta.pauseLayer?.clearLayers();

        meta.startMark
          .setLatLng(startLatLng)
          .bindTooltip(useCombinedEndpointLabel ? 'Salida/Llegada' : 'Salida', {
            permanent: true,
            direction: 'top',
            offset: [0, -8],
            className: 'track-endpoint-label track-endpoint-label--start'
          })
          .addTo(this.map);
        meta.endMark
          .setLatLng(endLatLng)
          .addTo(this.map);
        if (useCombinedEndpointLabel) {
          meta.endMark.unbindTooltip();
        } else {
          meta.endMark.bindTooltip('Llegada', {
            permanent: true,
            direction: 'top',
            offset: [0, -8],
            className: 'track-endpoint-label track-endpoint-label--end'
          });
        }
        meta.hoverMark.setLatLng(startLatLng).addTo(this.map);

        const start = meta.sanitized[0].t;
        const end = meta.sanitized[meta.sanitized.length - 1].t;
        let tickAbs = start + this.TICK_STEP_MS;
        while (tickAbs < end) {
          this.addTickAtAbs(meta.sanitized, tickAbs, meta.color, meta.ticks, start);
          tickAbs += this.TICK_STEP_MS;
        }
        this.addFinalTick(meta.sanitized, meta.color, meta.ticks, start);

        boundsPts.push(...latlngs);
      } else {
        meta.full?.setLatLngs([]);
        meta.prog?.setLatLngs([]);
        meta.ticks?.clearLayers();
        meta.pauseLayer?.clearLayers();
      }
    });

    const union = L.latLngBounds(boundsPts);
    this.allTracksBounds = union.isValid() ? union.pad(0.05) : null;
    if (this.allTracksBounds && !this.editMode) {
      this.map.fitBounds(this.allTracksBounds, {
        ...this.computeFitOptions(),
        maxZoom: this.leaderZoomLevel - 1
      });
      this.map.invalidateSize();
    }
  }

  // ---------- lifecycle ----------
  ngOnInit(): void {
    this.updateViewportFlags();

    const startFlag = this.route.snapshot.queryParamMap.get('s');
    this.autoStartRequested = false // (startFlag === '1' || startFlag === 'true');

    this.hydrateRemoveStopsFlag();

    const backendRouteId = Number(this.route.snapshot.queryParamMap.get('routeId'));
    if (Number.isFinite(backendRouteId)) {
      this.loadTracksFromBackend(backendRouteId);
      return;
    }

    this.loadTracksFromSessionOrQuery();
  }


  ngAfterViewInit(): void {
    
    this.initMap();
    setTimeout(() => {
      this.applyAspectViewport().then(() => {
        this.attachTrackLayers();
        if (this.viewOnly) {
          this.renderStaticTracks();
        } else {
          this.hasTracksReady = this.startIfReady();
          this.startCountdown();
          void this.autoStartIfRequested();
        }
      });
    }, 0);

    this.audio = document.getElementById('background-music-carrera') as HTMLAudioElement;
    this.countdownAudio = document.getElementById('countdown-sound') as HTMLAudioElement;

    // Desbloquear audio en el primer gesto del usuario (click/tap/tecla)
    // const unlock = () => {
    //   this.audio.play()
    //     .then(() => { this.isMusicOn = true; })
    //     .catch(err => console.warn('No se pudo iniciar audio:', err));
    //   window.removeEventListener('pointerdown', unlock);
    //   window.removeEventListener('keydown', unlock);
    // };
    // window.addEventListener('pointerdown', unlock, { once: true });
    // window.addEventListener('keydown', unlock, { once: true });
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateViewportFlags();
  }

  private updateViewportFlags(): void {
    if (typeof window === 'undefined') {
      this.isMobileViewport = false;
      return;
    }

    this.isMobileViewport = window.matchMedia('(max-width: 768px)').matches;
  }

  private startCountdown(): void {
    if (this.viewOnly) {
      return;
    }
    if (this.countdownInProgress || this.startSequenceLaunched || !this.hasTracksReady) {
      return;
    }

    this.showStartOverlay = true;
    this.startArmed = true;
    this.countdownInProgress = true;
    this.countdownValue = '3';

    if (this.countdownSoundEnabled) {
      this.countdownAudio.currentTime = 0;
      void this.countdownAudio.play().catch(() => { /* ignore */ });
    }

    let current = 3;
    this.clearCountdownTimer();
    this.countdownTimer = window.setInterval(() => {
      current -= 1;
      if (current > 0) {
        this.countdownValue = current.toString();
        return;
      }

      this.clearCountdownTimer();
      this.countdownValue = 'GO';
      setTimeout(() => {
        void this.startRaceFlow();
      }, 750);
    }, 1000);
  }

  private clearCountdownTimer(): void {
    if (this.countdownTimer !== null) {
      window.clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private async startRaceFlow(): Promise<void> {
    if (this.startSequenceLaunched) return;

    this.startSequenceLaunched = true;
    this.showRanking = false;
    this.ranking = [];
    this.autoStartDone = true;
    this.autoStartRequested = false;
    this.startArmed = true;

    try {
      await this.applyAspectViewport();

      if (this.recordingEnabled) {
        const { width, height } = this.getVideoDimensions();
        await this.rec.startCapture({
          includeAudio: true,
          frameRate: 60,
          videoBitsPerSecond: 8_000_000,
          width,
          height,
          aspectRatio: width / height
        });
      }

      if (this.musicEnabled) {
        await this.audio.play().catch(() => { /* ignore */ });
      }
    } catch (e) {
      console.error('No se pudo iniciar la captura:', e);
    } finally {
      this.showStartOverlay = false;
      this.countdownInProgress = false;
      this.countdownValue = null;

      if (this.hasTracksReady) {
        this.afterInicio();
      }
    }
  }

  private async autoStartIfRequested(): Promise<void> {
    if (!this.autoStartRequested || this.autoStartDone || this.recordingEnabled || !this.hasTracksReady) {
      return;
    }

    this.autoStartDone = true;
    this.startArmed = true;
    this.startCountdown();
  }

  private applyAspectViewport(): Promise<void> {
    this.isVerticalViewport = this.recordingAspect === '9:16';

    return new Promise(resolve => {
      requestAnimationFrame(() => {
        if (this.map) {
          this.map.invalidateSize();
        }
        resolve();
      });
    });
  }

  async stopRecordingAndDownload(): Promise<void> {
    if (!this.recordingEnabled || !this.rec.isRecording) {
      return;
    }
    try {
      const blob = await this.rec.stopAndGetBlob();
      this.rec.downloadBlob(blob, 'gpx-anim');
    } catch (e) {
      console.error('Error al parar/descargar:', e);
    }
  }

  // onStartClick(): void {
  //   this.showStartOverlay = false;   // ocultar overlay
  //   this.startArmed = true;          // autoriza el arranque

  //   // intentar reproducir música (ya hay interacción del usuario)
  //   if (this.audio) {
  //     this.audio.play().catch(err => console.warn('Audio no pudo empezar:', err));
  //   }

  //   // arrancar animación si ya están los datos
  //   if(this.inicioMapa != null){
  //     this.afterInicio(this.inicioMapa.has1, this.inicioMapa.has2)
  //   }
  // }

  // ---------- mapa ----------
  private initMap(): void {
    this.map = L.map('map', { preferCanvas: true, zoomSnap: 0.1 }).setView([40.4168, -3.7038], 6);
    this.applyBaseLayer();
    this.renderer = L.canvas({ padding: 0.25 }).addTo(this.map);
    this.attachTrackLayers();
    this.editPointsLayer = L.layerGroup().addTo(this.map);
    this.map.on('click', (event: L.LeafletMouseEvent) => this.handleMapClick(event));
  }

  onBaseLayerChange(baseLayerId: string): void {
    this.selectedBaseLayerId = baseLayerId;
    this.applyBaseLayer();
  }

  private applyBaseLayer(): void {
    if (!this.map) return;

    const option = this.baseLayerOptions.find((o) => o.id === this.selectedBaseLayerId) ?? this.baseLayerOptions[0];
    if (!option) return;

    if (this.baseLayer) {
      this.map.removeLayer(this.baseLayer);
    }

    this.baseLayer = L.tileLayer(option.url, {
      maxZoom: option.maxZoom ?? 19,
      attribution: option.attribution
    }).addTo(this.map);
  }

  private attachTrackLayers(): void {
    if (!this.map || !this.renderer) return;

    const ghost = (color: string): L.PolylineOptions => ({
      color, weight: this.ghostWeight, opacity: this.ghostOpacity, renderer: this.renderer, interactive: false, fill: false, stroke: true
    });
    const prog = (color: string): L.PolylineOptions => ({
      color, weight: 4, opacity: this.progressOpacity, renderer: this.renderer, interactive: false, fill: false, stroke: true
    });
    const mk = (c: string) => L.divIcon({
      className: 'custom-circle-icon',
      html: `<div style="width:14px;height:14px;background:${c};border-radius:50%"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9]
    });

    this.trackMetas = this.trackMetas.map((meta) => ({
      ...meta,
      full: meta.full ?? L.polyline([], ghost(meta.color)).addTo(this.map),
      prog: meta.prog ?? L.polyline([], prog(meta.color)).addTo(this.map),
      mark: meta.mark ?? L.marker([0, 0], { icon: mk(meta.color) }),
      startMark: meta.startMark ?? L.circleMarker([0, 0], {
        radius: 6,
        color: '#22c55e',
        weight: 2,
        fillColor: '#22c55e',
        fillOpacity: 0.9,
        pane: 'overlayPane'
      }),
      endMark: meta.endMark ?? L.circleMarker([0, 0], {
        radius: 6,
        color: '#ef4444',
        weight: 2,
        fillColor: '#ef4444',
        fillOpacity: 0.9,
        pane: 'overlayPane'
      }),
      hoverMark: meta.hoverMark ?? L.circleMarker([0, 0], {
        radius: 6,
        color: meta.color,
        weight: 2,
        fillColor: '#fff',
        fillOpacity: 1,
        pane: 'overlayPane'
      }),
      ticks: meta.ticks ?? L.layerGroup().addTo(this.map),
      pauseLayer: meta.pauseLayer ?? L.layerGroup().addTo(this.map)
    }));
  }

  private startIfReady(): boolean {
    if (this.started) return true;

    this.showRanking = false;
    this.ranking = [];

    const boundsPts: L.LatLng[] = [];
    let anyTrack = false;

    this.trackMetas.forEach((meta) => {
      meta.has = meta.sanitized.length >= 2;
      meta.cursor = 0;
      meta.nextTickRel = this.TICK_STEP_MS;
      meta.finalAdded = false;

      if (meta.has && meta.full && meta.prog && meta.mark && meta.ticks && meta.pauseLayer) {
        const latlngs = meta.sanitized.map(p => L.latLng(p.lat, p.lon));
        const startLatLng = latlngs[0];
        meta.full.setLatLngs(latlngs);
        meta.prog.setLatLngs([startLatLng]);
        meta.mark.setLatLng(startLatLng).addTo(this.map);
        meta.ticks.clearLayers();
        meta.pauseLayer.clearLayers();
        meta.pauses.forEach((pause) => this.addPauseMarker(pause, meta.color, meta.pauseLayer!));
        boundsPts.push(...latlngs);
        anyTrack = true;
      } else if (meta.full && meta.prog && meta.ticks && meta.pauseLayer) {
        meta.full.setLatLngs([]);
        meta.prog.setLatLngs([]);
        meta.ticks.clearLayers();
        meta.pauseLayer.clearLayers();
      }
    });

    this.applyTrackVisibility();

    const union = L.latLngBounds(boundsPts);
    this.allTracksBounds = union.isValid() ? union.pad(0.05) : null;
    if (this.allTracksBounds) {
      this.map.fitBounds(this.allTracksBounds, {
        ...this.computeFitOptions(),
        maxZoom: this.leaderZoomLevel - 1
      });
      const currentZoom = this.map.getZoom();
      if (this.isZoomMode) {
        const targetZoom = Math.min(this.leaderZoomLevel - 1, currentZoom + 1);
        if (targetZoom > currentZoom) {
          this.map.setZoom(targetZoom);
        }
      } else {
        const scaledZoom = currentZoom + Math.log2(this.generalViewZoomScaleForViewport);
        const boundedZoom = Math.max(this.map.getMinZoom(), Math.min(this.leaderZoomLevel - 1, scaledZoom));
        if (boundedZoom !== currentZoom) {
          this.map.setZoom(boundedZoom);
        }
      }
      this.map.invalidateSize();
    }

    if (!anyTrack) return false;

    const durations = this.trackMetas
      .filter(meta => meta.has && meta.sanitized.length >= 2)
      .map(meta => meta.sanitized[meta.sanitized.length - 1].t - meta.sanitized[0].t);
    const maxDur = durations.length ? Math.max(...durations) : 0;
    this.maxRaceDurationMs = maxDur;
    this.replaySpeed = maxDur > 0 ? maxDur / (this.desiredDurationSec * 1000) : 8;
    if (!Number.isFinite(this.replaySpeed) || this.replaySpeed <= 0) this.replaySpeed = 8;

    if (this.isZoomMode) {
      this.replaySpeed *= this.zoomPlaybackFactor;
    }

    this.relMs = 0;
    this.started = true;

    // Si el usuario ya pulsó "Start" antes de que los tracks estuvieran listos,
    // arranca la animación en cuanto terminemos de preparar todo.
    if (this.startArmed && !this.showStartOverlay) {
      this.afterInicio();
    }

    return true;
  }

  afterInicio(): void {
    this.lastZoomSwitch = performance.now();
    this.zoomPhase = 'focus';
    this.midOverviewShown = false;
    this.midOverviewActive = false;
    this.firstFinisherSeen = false;
    this.lastLeaderPan = 0;
    this.lastLeaderTarget = null;

    this.applyTrackVisibility();
    this.profileCursorX = 0;

    let last = performance.now();
    const step = (now: number) => {
      const rawDt = now - last; last = now;
      const dt = Math.min(rawDt, 50);
      this.relMs += dt * this.replaySpeed;

      let allDone = true;

      this.trackMetas.forEach((meta, index) => {
        if (!meta.has || !meta.sanitized.length || !meta.prog || !meta.mark || !meta.ticks) return;

        const start = meta.sanitized[0].t;
        const end = meta.sanitized[meta.sanitized.length - 1].t;
        const tAbs = start + this.relMs;

        while (meta.cursor + 1 < meta.sanitized.length && meta.sanitized[meta.cursor + 1].t <= tAbs) meta.cursor++;

        const rel = tAbs - start;
        const endRel = end - start;
        while (meta.nextTickRel <= rel && meta.nextTickRel < endRel) {
          const absTick = start + meta.nextTickRel;
          this.addTickAtAbs(meta.sanitized, absTick, meta.color, meta.ticks, start);
          meta.nextTickRel += this.TICK_STEP_MS;
        }

        const pos = this.positionAt(meta.sanitized, tAbs, { i: meta.cursor });
        const path = meta.sanitized
          .slice(0, meta.cursor + 1)
          .map(p => L.latLng(p.lat, p.lon));
        path.push(L.latLng(pos[0], pos[1]));
        meta.prog.setLatLngs(path);
        meta.mark.setLatLng(L.latLng(pos[0], pos[1]));

        if (this.profileEnabled && index === this.profileTrackIndex) {
          this.updateProfileCursor(meta, tAbs);
        }

        const done = meta.cursor >= meta.sanitized.length - 1 && tAbs >= end;
        if (done && !meta.finalAdded) {
          this.addFinalTick(meta.sanitized, meta.color, meta.ticks, start);
          meta.finalAdded = true;
        }
        if (!done) allDone = false;
      });

      const someoneFinished = this.hasAnyFinished(this.relMs);
      this.updateVisualization(now, this.relMs, someoneFinished);

      if (!allDone) {
        this.rafId = requestAnimationFrame(step);
      } else {
        cancelAnimationFrame(this.rafId);
        this.audio?.pause();
        this.stopRecordingAndDownload();
        this.ranking = this.buildRanking();
        this.showRanking = this.ranking.length > 0;
      }
    };

    this.rafId = requestAnimationFrame(step);
  }

  private hasAnyFinished(relMs: number): boolean {
    return this.trackMetas.some(meta => {
      if (!meta.has || meta.sanitized.length < 2) return false;
      const start = meta.sanitized[0].t;
      const end = meta.sanitized[meta.sanitized.length - 1].t;
      return relMs >= (end - start);
    });
  }

  private get isZoomMode(): boolean {
    return this.visualizationMode === 'zoomCabeza';
  }

  private get shouldShowTracks(): boolean {
    return !this.isZoomMode || this.zoomPhase === 'overview';
  }

  private get leaderPanInterval(): number {
    return this.isZoomMode ? this.leaderPanIntervalMs * this.zoomPanSlowdownFactor : this.leaderPanIntervalMs;
  }

  private get leaderFlyDuration(): number {
    return this.isZoomMode ? this.leaderFlyDurationMs * this.zoomPanSlowdownFactor : this.leaderFlyDurationMs;
  }

  private get generalViewZoomScaleForViewport(): number {
    return this.isVerticalViewport ? this.generalViewZoomScaleVertical : this.generalViewZoomScale;
  }

  private setGeneralView(): void {
    if (!this.map) return;
    if (this.allTracksBounds && this.allTracksBounds.isValid()) {
      this.map.flyToBounds(this.allTracksBounds, {
        animate: true,
        duration: 0.7,
        ...this.computeFitOptions(),
        maxZoom: this.leaderZoomLevel - 1,
      });
    }
  }

  private computeFitOptions(): L.FitBoundsOptions {
    const basePadding = this.computeBasePadding();
    if (!this.isVerticalViewport) return { padding: basePadding };

    const mapEl = document.getElementById('map');
    if (!mapEl) return { padding: basePadding };

    const mapRect = mapEl.getBoundingClientRect();
    const topOverlay = document.querySelector('.map-ui') as HTMLElement | null;
    const bottomOverlay = (document.querySelector('.map-logo img') || document.querySelector('.map-logo')) as HTMLElement | null;

    const topOverlap = topOverlay ? this.measureVerticalOverlap(topOverlay.getBoundingClientRect(), mapRect) : 0;
    const bottomOverlap = bottomOverlay ? this.measureVerticalOverlap(bottomOverlay.getBoundingClientRect(), mapRect) : 0;

    const paddingTop = basePadding[1] + topOverlap;
    const paddingBottom = basePadding[1] + bottomOverlap;

    return {
      paddingTopLeft: L.point(basePadding[0], paddingTop),
      paddingBottomRight: L.point(basePadding[0], paddingBottom)
    };
  }

  private computeBasePadding(): [number, number] {
    if (!this.map) return [24, 24];
    if (!this.isVerticalViewport) return [24, 24];

    const size = this.map.getSize();
    const padX = Math.max(40, Math.round(size.x * 0.12));
    const padY = Math.max(30, Math.round(size.y * 0.08));
    return [padX, padY];
  }

  private measureVerticalOverlap(rect: DOMRect, mapRect: DOMRect): number {
    const overlap = Math.max(0, Math.min(rect.bottom, mapRect.bottom) - Math.max(rect.top, mapRect.top));
    return Math.round(Math.min(overlap, mapRect.height));
  }

  private applyTrackVisibility(): void {
    const hideProgressForMidOverview = this.midOverviewActive && !this.firstFinisherSeen;
    const showProgress = this.shouldShowTracks && !hideProgressForMidOverview;

    this.trackMetas.forEach((meta) => {
      if (meta.full) meta.full.setStyle({ opacity: this.ghostOpacity, weight: this.ghostWeight });
      if (meta.prog) meta.prog.setStyle({ opacity: showProgress ? this.progressOpacity : 0 });
    });
  }

  private getLeaderPosition(relMs: number): L.LatLngExpression | null {
    let best: { progress: number; pos: [number, number] } | null = null;


    for (const meta of this.trackMetas) {
      if (!meta.has || meta.sanitized.length < 2) continue;

      const start = meta.sanitized[0].t;
      const end = meta.sanitized[meta.sanitized.length - 1].t;
      const rel = Math.max(0, Math.min(relMs, end - start));
      const progress = (end - start) > 0 ? rel / (end - start) : 0;
      if (!best || progress >= best.progress) {
        const tAbs = start + rel;
        const pos = this.positionAtAbs(meta.sanitized, tAbs);
        best = { progress, pos };
      }
    }


    if (!best) return null;

    const [lat, lon] = best.pos;
    return L.latLng(lat, lon);


  }

  private followLeader(relMs: number, now: number): void {
    if (!this.map) return;
    if (this.leaderAnimationRunning) return;
    if (now - this.lastLeaderPan < this.leaderPanInterval) return;

    const leader = this.getLeaderPosition(relMs);
    if (!leader) return;

    const target = L.latLng(leader);
    const zoomMismatch = this.map.getZoom() < this.leaderZoomLevel;

    if (this.isTargetWithinComfortZone(target) && !zoomMismatch) {
      this.lastLeaderTarget = target;
      return;
    }

    const movedEnough = !this.lastLeaderTarget || this.lastLeaderTarget.distanceTo(target) > (this.isZoomMode ? 2 : 5);
    if (!movedEnough && !zoomMismatch) return;

    this.leaderAnimationRunning = true;
    this.map.once('moveend', () => { this.leaderAnimationRunning = false; });
    this.map.flyTo(target, this.leaderZoomLevel, {
      animate: true,
      duration: this.leaderFlyDuration / 1000,
      easeLinearity: 0.25,
    });
    this.lastLeaderPan = now;
    this.lastLeaderTarget = target;
  }

  private isTargetWithinComfortZone(target: L.LatLng): boolean {
    if (!this.map) return true;

    if (!this.isVerticalViewport) {
      const viewBounds = this.map.getBounds().pad(this.isZoomMode ? -0.3 : -0.2);
      return viewBounds.contains(target);
    }

    const size = this.map.getSize();
    const paddingX = size.x * 0.25; // mayor margen lateral para 9:16
    const paddingY = size.y * 0.15;
    const comfortBounds = L.bounds(
      L.point(paddingX, paddingY),
      L.point(size.x - paddingX, size.y - paddingY)
    );
    const targetPoint = this.map.latLngToContainerPoint(target);
    return comfortBounds.contains(targetPoint);
  }

  private updateVisualization(now: number, relMs: number, someoneFinished: boolean): void {
    if (!this.map) return;
    if (this.visualizationMode === 'general') return;

    if (someoneFinished && !this.firstFinisherSeen) {
      this.firstFinisherSeen = true;
      this.midOverviewActive = false;
      this.zoomPhase = 'overview';
      this.setGeneralView();
      this.applyTrackVisibility();
      return;
    }

    if (this.firstFinisherSeen) return;

    const halfRaceMs = this.maxRaceDurationMs > 0 ? this.maxRaceDurationMs / 2 : null;
    if (!this.midOverviewShown && halfRaceMs !== null && relMs >= halfRaceMs) {
      this.midOverviewShown = true;
      this.midOverviewActive = true;
      this.zoomPhase = 'overview';
      this.lastZoomSwitch = now;
      this.setGeneralView();
      this.applyTrackVisibility();
      return;
    }

    if (this.zoomPhase === 'overview') {
      if (now - this.lastZoomSwitch >= this.overviewDurationMs) {
        this.zoomPhase = 'focus';
        this.lastZoomSwitch = now;
        this.midOverviewActive = false;
        this.applyTrackVisibility();
      } else {
        return;
      }
    }

    this.followLeader(relMs, now);
  }

  // Comprime el timeline detectando pausas como saltos de tiempo > 30 s entre puntos consecutivos
  // o tramos con velocidad muy baja (<= 0.2 m/s). Cada pausa se acumula y se resta a todos los
  // puntos posteriores, dejando el track como si no se hubiera detenido la grabación.
  private removeStopsAdaptive(xs: TPx[], pauseThresholdMs = 30_000): { track: TPx[]; pauses: PauseInterval[] } {
    if (!xs || xs.length < 2) { console.log('[StopsAdaptive] EXIT early'); return { track: xs?.slice() ?? [], pauses: [] }; }

    const out: TPx[] = [];
    const pauses: PauseInterval[] = [];
    let totalPauseMs = 0;
    let inPause = false;
    let pauseStartAbs = 0;
    let pauseDuration = 0;
    let pauseEndAbs = 0;
    let pauseAnchor: { lat: number; lon: number } | null = null;

    for (let i = 0; i < xs.length; i++) {
      const originalTime = xs[i].t;

      if (i > 0) {
        const gapMs = originalTime - xs[i - 1].t;
        const speedMs = this.speedMs(xs[i - 1], xs[i]);
        const isLongGap = gapMs > pauseThresholdMs;
        const isStopped = speedMs <= 0.2;

        if (isLongGap || isStopped) {
          totalPauseMs += gapMs; // acumulamos TODO el parón detectado
          if (!inPause) {
            inPause = true;
            pauseStartAbs = xs[i - 1].t;
            const anchorSource = isLongGap ? xs[i - 1] : xs[i];
            pauseAnchor = { lat: anchorSource.lat, lon: anchorSource.lon };
            pauseDuration = 0;
          }
          pauseDuration += gapMs;
          pauseEndAbs = xs[i].t;
        } else if (inPause) {
          pauses.push({
            startAbs: pauseStartAbs,
            endAbs: pauseEndAbs,
            durationMs: pauseDuration,
            anchor: pauseAnchor ?? { lat: xs[i - 1].lat, lon: xs[i - 1].lon }
          });
          inPause = false;
        }
      }

      out.push({ ...xs[i], t: originalTime - totalPauseMs });
    }

    if (inPause) {
      pauses.push({
        startAbs: pauseStartAbs,
        endAbs: pauseEndAbs,
        durationMs: pauseDuration,
        anchor: pauseAnchor ?? { lat: xs[xs.length - 1].lat, lon: xs[xs.length - 1].lon }
      });
    }

    console.log('[StopsAdaptive] total pausa (s):', Math.round(totalPauseMs / 1000), 'umbral (ms):', pauseThresholdMs, 'pausas:', pauses.length);
    return { track: out, pauses };
  }

  private buildRanking(): RankingEntry[] {
    const valid = this.trackMetas
      .filter(meta => meta.has && meta.sanitized.length >= 2)
      .map(meta => ({
        name: meta.name,
        color: meta.color,
        durationMs: meta.sanitized[meta.sanitized.length - 1].t - meta.sanitized[0].t
      }))
      .filter(r => Number.isFinite(r.durationMs) && r.durationMs > 0)
      .sort((a, b) => a.durationMs - b.durationMs);

    if (valid.length < 2) return [];

    return valid.map((entry, index): RankingEntry => ({
      ...entry,
      medal: index === 0
        ? 'gold'
        : index === 1
          ? 'silver'
          : index === 2
            ? 'bronze'
            : undefined

    }));
  }

  dismissUniformSpeedDialog(): void {
    this.showUniformSpeedDialog = false;
  }

  formatRaceTime(ms: number): string {
    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const mm = minutes.toString().padStart(2, '0');
    const ss = seconds.toString().padStart(2, '0');
    return hours > 0
      ? `${hours}:${mm}:${ss}`
      : `${mm}:${ss}`;
  }

}
