import { workspaceReturnUrl } from '../utils/workspace-return';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';
import { AfterViewInit, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import maplibregl, { GeoJSONSource } from 'maplibre-gl';
import { MapPayloadTransferService } from '../services/map-payload-transfer.service';
import { RecorderService } from '../recording/recorder.service';
import { calculateElevation, calculateGpxElevation } from '../utils/gpx-elevation';
import { advanceDiscoveryElevation, advanceDiscoveryHeading, angleDelta, discoveryDuration, discoveryFlightFraming, discoveryFrameSeconds, DiscoveryHeading, discoveryHeadingAt, DiscoveryPoint, DiscoveryRoute, discoveryTimeline, prepareDiscoveryRoute, sampleDiscoveryRoute } from '../utils/discovery-route';
import type { DiscoveryPlace } from '../utils/discovery-places';
import { AnimationAccessService, AnimationGate } from '../services/animation-access.service';
import type { CamaraDescubrir, VelocidadDescubrir } from '../interfaces/estructuras';
import { selectedUiText } from '../services/screen-texts';

interface DiscoveryPayload {
  routeXml?: string;
  tipoAnimacion?: string;
  names?: string[];
  tracks?: { trkpts: DiscoveryPoint[] }[];
  trackDescubrir?: number;
  camaraDescubrir?: CamaraDescubrir;
  velocidadDescubrir?: VelocidadDescubrir;
  activarMusica?: boolean;
  grabarAnimacion?: boolean;
  relacionAspectoGrabacion?: string;
  mostrarPerfil?: boolean;
}
interface FlightCamera { center: [number, number]; zoom: number; bearing: number; pitch: number; }

@Component({
  selector: 'app-discover-route',
  templateUrl: './discover-route.component.html',
  styleUrls: ['./discover-route.component.css']
})
export class DiscoverRouteComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;
  name = selectedUiText('discoverRoute');
  duration = 60;
  vertical = false;
  ready = false;
  playing = false;
  preparing = false;
  completed = false;
  elapsed = 0;
  progress = 0;
  distanceKm = 0;
  gain: number | null = null;
  elevationQuality: string | null = null;
  profilePoints = '';
  error = '';
  notice = '';
  gate: AnimationGate | null = null;
  private accessGranted = false;
  private checkingAccess = false;
  terrainAvailable = true;
  nearbyPlace: DiscoveryPlace | null = null;
  private places: DiscoveryPlace[] = [];
  private selectPlace?: typeof import('../utils/discovery-places').nearbyDiscoveryPlace;
  private placesAbort?: AbortController;
  private map?: maplibregl.Map;
  private routeData: DiscoveryRoute = { points: [], distances: [], total: 0 };
  private payload: DiscoveryPayload = {};
  private raf = 0;
  private destroyed = false;
  private ownsRecording = false;
  private finishingRecording = false;
  private audio = new Audio('assets/musica/carrera.mp3');
  private overview!: FlightCamera;
  private flight!: FlightCamera;
  private ending?: FlightCamera;
  private flightZoom = 15;
  private flightPitch = 50;
  private cameraElevation = 0;
  private heading: DiscoveryHeading = { bearing: 0, target: 0, candidate: null, candidateSeconds: 0 };
  private lastFrame = 0;
  private lastDraw = -Infinity;
  private lastPlaceCheck = -Infinity;
  private drawnDistance = 0;
  private drawnIndex = 0;
  private lineCoordinates: [number, number][] = [];
  private lineDistances: number[] = [];
  private resizeObserver?: ResizeObserver;
  private loadTimeout?: number;

  constructor(private router: Router, private activatedRoute: ActivatedRoute,
    private transfer: MapPayloadTransferService, public recorder: RecorderService, private zone: NgZone,
    private animationAccess: AnimationAccessService, private auth: AuthService) {
    this.audio.loop = true;
    this.audio.volume = 0.4;
    this.readPayload();
  }

  private readPayload(): void {
    let payload = this.router.getCurrentNavigation()?.extras.state?.['gpxViewerPayload']
      ?? window.history.state?.gpxViewerPayload ?? this.transfer.get<DiscoveryPayload>();
    if (!payload) {
      try { payload = JSON.parse(sessionStorage.getItem('gpxViewerPayload') || 'null'); } catch { /* Storage may be disabled. */ }
    }
    if (!payload && window.name.startsWith('gpxViewerPayload:')) {
      try { payload = JSON.parse(decodeURIComponent(window.name.slice('gpxViewerPayload:'.length))); } catch { /* Invalid transfer. */ }
    }
    if (!payload || payload.tipoAnimacion !== 'descubrir') {
      this.error = selectedUiText('loadTrackToDiscover');
      return;
    }
    this.payload = payload;
    this.transfer.clear();
    if (window.name.startsWith('gpxViewerPayload:')) window.name = '';
    const index = Number.isInteger(payload.trackDescubrir) ? payload.trackDescubrir : 0;
    const input = payload.tracks?.[index]?.trkpts;
    this.routeData = prepareDiscoveryRoute(Array.isArray(input) ? input : []);
    if (this.routeData.points.length < 2 || this.routeData.total < 1) {
      this.error = selectedUiText('invalidDiscoveryTrack');
      return;
    }
    this.name = payload.names?.[index] || selectedUiText('myRoute');
    this.duration = discoveryDuration(this.routeData.total, payload.velocidadDescubrir);
    this.vertical = payload.relacionAspectoGrabacion === '9:16';
    this.distanceKm = this.routeData.total / 1000;
    // Statistics use the original recording, never geometry prepared for the camera.
    const elevation = payload.routeXml ? calculateGpxElevation(payload.routeXml)
      : calculateElevation((input as DiscoveryPoint[]).map(p => ({ ...p,
        ele: Number.isFinite(p.ele) ? p.ele! : null, segment: p.segment ?? 0 })));
    this.gain = elevation.gain;
    this.elevationQuality = elevation.quality;
    if (payload.mostrarPerfil && elevation.profile.length > 1) {
      const min = elevation.min ?? 0, span = Math.max(1, (elevation.max ?? 0) - min);
      const step = Math.max(1, Math.ceil(elevation.profile.length / 500));
      this.profilePoints = elevation.profile.filter((_, i, a) => i % step === 0 || i === a.length - 1)
        .map(p => `${(p.distanceKm / Math.max(elevation.distanceKm, 0.001) * 600).toFixed(1)},${(65 - (p.ele - min) / span * 55).toFixed(1)}`).join(' ');
    }
    // Keep every bend in the route. Only sub-metre duplicates were removed above.
    this.lineCoordinates = this.routeData.points.map(p => [p.lon, p.lat]);
    this.lineDistances = this.routeData.distances;
  }

  get durationLabel(): string {
    const totalSeconds = Math.ceil(this.duration);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (!minutes) return `${seconds} s`;
    return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
  }

  ngAfterViewInit(): void {
    this.initializeMap();
    void this.animationAccess.refreshAvailability();
    if (!this.error) void this.preparePlaces();
  }

  private async preparePlaces(): Promise<void> {
    if (this.destroyed) return;
    const token = this.auth.getValidToken();
    if (!token) return;
    const controller = this.placesAbort = new AbortController();
    try {
      const lookup = await import('../utils/discovery-places');
      if (this.destroyed || controller.signal.aborted) return;
      const places = await lookup.loadDiscoveryPlaces(this.routeData, controller.signal, environment.routePlacesUrl, token);
      if (this.destroyed) return;
      this.places = places;
      this.selectPlace = lookup.nearbyDiscoveryPlace;
      // A response received while paused should update the current place too.
      const time = discoveryTimeline(this.elapsed, this.duration);
      this.nearbyPlace = time.phase === 'route'
        ? this.selectPlace(places, sampleDiscoveryRoute(this.routeData, this.routeData.total * time.progress), this.nearbyPlace) : null;
    } catch { /* Optional labels: loading and failures stay invisible during playback. */ }
  }

  private initializeMap(): void {
    if (this.error) return;
    this.zone.runOutsideAngular(() => {
      try {
        this.loadTimeout = window.setTimeout(() => {
          this.failLoading(selectedUiText('mapPrepareFailed'));
        }, 25000);
        const first = this.routeData.points[0];
        this.map = new maplibregl.Map({
          container: this.mapContainer.nativeElement,
          center: [first.lon, first.lat], zoom: 12, pitch: 45, maxPitch: 70,
          // We smooth altitude ourselves. Automatic terrain clamping can otherwise
          // overwrite it on every render / tile arrival, shaking the whole scene.
          centerClampedToGround: false,
          interactive: false, attributionControl: { compact: true,
            customAttribution: 'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener">Geoapify</a> · Poblaciones © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' },
          style: {
            version: 8,
            sources: {
              satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                tileSize: 256, maxzoom: 19, attribution: 'Tiles © Esri — Esri, Maxar, Earthstar Geographics, and the GIS User Community' },
              elevation: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
                tileSize: 256, maxzoom: 15, encoding: 'terrarium',
                attribution: '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Terrain © Mapzen and contributors</a>' },
              route: { type: 'geojson', data: this.lineData(this.lineCoordinates) },
              progress: { type: 'geojson', data: this.lineData([]) }
            },
            terrain: { source: 'elevation', exaggeration: 1 },
            layers: [
              { id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-fade-duration': 200 } },
              { id: 'route-preview', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': '#f6ec55', 'line-width': 3, 'line-opacity': 0.65 } },
              { id: 'route-shadow', type: 'line', source: 'progress', layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': '#263a12', 'line-width': 8, 'line-opacity': 0.5, 'line-blur': 2 } },
              { id: 'route-progress', type: 'line', source: 'progress', layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': '#f6ed42', 'line-width': 4, 'line-opacity': 1 } }
            ]
          }
        });
        this.map.on('error', event => {
          if (this.destroyed || this.error) return;
          const source = (event as maplibregl.ErrorEvent & { sourceId?: string }).sourceId;
          if (source === 'elevation' && this.terrainAvailable) {
            // Terrain is optional: a failed elevation service must not block playback.
            this.map?.setTerrain(null);
            this.zone.run(() => { this.terrainAvailable = false; this.notice = selectedUiText('terrainUnavailable'); });
          } else if (source === 'satellite') {
            this.zone.run(() => { this.notice = selectedUiText('mapImagesFailed'); });
          }
        });
        this.map.once('load', () => {
          if (this.destroyed || this.error) return;
          try {
            this.setupCamera();
            this.clearLoadTimeout();
            this.zone.run(() => { this.ready = true; });
          } catch {
            this.failLoading(selectedUiText('routeViewFailed'));
          }
        });
        this.resizeObserver = new ResizeObserver(() => {
          this.map?.resize();
          if (this.ready && !this.playing && this.elapsed === 0) this.setupCamera();
          else if (this.ready) this.updateFlightFraming();
        });
        this.resizeObserver.observe(this.mapContainer.nativeElement);
      } catch {
        this.failLoading(selectedUiText('map3dFailed'));
      }
    });
  }

  get canRetryLoading(): boolean { return this.routeData.total >= 1; }

  retryLoading(): void {
    if (this.destroyed || !this.canRetryLoading) return;
    // A failed worker can remain in MapLibre's shared global dispatcher even
    // after map.remove(). Reload the runtime, preserving the in-memory GPX too.
    window.name = `gpxViewerPayload:${encodeURIComponent(JSON.stringify(this.payload))}`;
    window.location.reload();
  }

  private failLoading(message: string): void {
    this.clearLoadTimeout();
    if (!this.destroyed) this.zone.run(() => { this.error = message; });
  }

  private clearLoadTimeout(): void {
    if (this.loadTimeout !== undefined) window.clearTimeout(this.loadTimeout);
    this.loadTimeout = undefined;
  }

  private setupCamera(): void {
    if (!this.map) return;
    const bounds = new maplibregl.LngLatBounds();
    this.routeData.points.forEach(p => bounds.extend([p.lon, p.lat]));
    const start = this.routeData.points[0];
    const bearing = discoveryHeadingAt(this.routeData, 0, this.duration) ?? 0;
    this.heading = { bearing, target: bearing, candidate: null, candidateSeconds: 0 };
    const fit = this.map.cameraForBounds(bounds, { padding: { top: 110, bottom: 150, left: 45, right: 45 }, maxZoom: 15, bearing });
    const center = fit?.center ? maplibregl.LngLat.convert(fit.center) : new maplibregl.LngLat(start.lon, start.lat);
    this.overview = { center: [center.lng, center.lat], zoom: (fit?.zoom ?? 12) - 0.4, bearing, pitch: 35 };
    this.updateFlightFraming();
    // Look down more and give the route room so foreground ridges hide less of it.
    this.flight = { center: [start.lon, start.lat], zoom: this.flightZoom, bearing, pitch: this.flightPitch };
    this.cameraElevation = this.map.queryTerrainElevation(this.overview.center) ?? 0;
    this.map.jumpTo({ ...this.overview, elevation: this.cameraElevation });
  }

  private updateFlightFraming(): void {
    const framing = discoveryFlightFraming(this.routeData, this.duration, this.mapContainer.nativeElement.clientWidth,
      this.payload.camaraDescubrir);
    this.flightZoom = framing.zoom;
    this.flightPitch = framing.pitch;
  }

  async play(): Promise<void> {
    if (!this.ready || this.preparing || this.playing || this.finishingRecording || this.destroyed || this.gate || this.checkingAccess) return;
    const fresh = this.elapsed === 0 || this.completed;
    if (fresh) {
      const cooldown = this.animationAccess.getKnownCooldown();
      if (cooldown) { this.gate = cooldown; return; }
    }
    if (fresh) {
      this.accessGranted = false;
      this.elapsed = 0; this.progress = 0; this.completed = false; this.ending = undefined;
      this.nearbyPlace = null;
      this.drawnDistance = 0; this.drawnIndex = 0; this.lastDraw = -Infinity; this.lastPlaceCheck = -Infinity;
      this.setupCamera();
      this.map?.setPaintProperty('route-preview', 'line-opacity', 0);
      this.drawRoute(0);
      this.audio.currentTime = 0;
    }
    this.preparing = true;
    // Start audio/capture directly from the click to retain the browser user gesture.
    if (this.payload.activarMusica) void this.audio.play().catch(() => { /* Music is optional. */ });
    if (fresh && this.payload.grabarAnimacion) {
      try {
        await this.recorder.startCapture({ includeAudio: true, frameRate: 60, videoBitsPerSecond: 8_000_000,
          width: this.vertical ? 1080 : 1920, height: this.vertical ? 1920 : 1080, aspectRatio: this.vertical ? 9 / 16 : 16 / 9 });
        this.ownsRecording = true;
      } catch {
        this.notice = 'La grabación no se ha iniciado. Puedes ver la animación y volver a intentarlo al repetir.';
      }
    }
    if (this.destroyed) {
      if (this.ownsRecording) await this.finishRecording(false);
      return;
    }
    this.preparing = false;
    if (this.ownsRecording) this.recorder.resumeCapture();
    this.playing = true;
    this.lastFrame = performance.now();
    this.zone.runOutsideAngular(() => { this.raf = requestAnimationFrame(now => this.tick(now)); });
  }

  pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.audio.pause();
    if (this.ownsRecording) this.recorder.pauseCapture();
  }

  private tick(now: number): void {
    if (!this.map || !this.playing || this.destroyed) return;
    const dt = discoveryFrameSeconds((now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.elapsed = Math.min(this.accessGranted ? this.duration : this.duration / 2, this.elapsed + dt);
    const time = discoveryTimeline(this.elapsed, this.duration);
    const distance = this.routeData.total * time.progress;
    if (time.phase === 'intro') {
      this.applyCamera(this.interpolateCamera(this.overview, this.flight, time.transition), dt);
    } else if (time.phase === 'route') {
      const ahead = Math.max(40, Math.min(250, this.routeData.total * 0.008));
      const center = sampleDiscoveryRoute(this.routeData, distance + ahead * 0.25);
      this.heading = advanceDiscoveryHeading(this.heading, discoveryHeadingAt(this.routeData, distance, this.duration), dt);
      this.flight.bearing = this.heading.bearing;
      const framingEase = 1 - Math.exp(-dt / 0.8);
      this.flight.zoom += (this.flightZoom - this.flight.zoom) * framingEase;
      this.flight.pitch += (this.flightPitch - this.flight.pitch) * framingEase;
      const ease = 1 - Math.exp(-dt / 0.35);
      this.flight.center = [this.flight.center[0] + (center.lon - this.flight.center[0]) * ease,
        this.flight.center[1] + (center.lat - this.flight.center[1]) * ease];
      this.applyCamera(this.flight, dt);
    } else {
      this.ending ??= { ...this.flight, center: [...this.flight.center] };
      this.applyCamera(this.interpolateCamera(this.ending, this.overview, time.transition), dt);
    }
    // Throttle worker updates independently of the smooth 60 fps camera.
    if (now - this.lastDraw >= 50 || this.elapsed === this.duration) {
      this.drawRoute(distance);
      this.lastDraw = now;
      // Place names need at most five checks per second; the route and progress keep their own cadence.
      const checkPlace = now - this.lastPlaceCheck >= 200 || (time.phase !== 'route' && this.nearbyPlace !== null);
      const place = checkPlace && time.phase === 'route' && this.selectPlace
        ? this.selectPlace(this.places, sampleDiscoveryRoute(this.routeData, distance), this.nearbyPlace) : null;
      if (checkPlace) this.lastPlaceCheck = now;
      this.zone.run(() => {
        this.progress = time.progress;
        if (checkPlace && this.nearbyPlace?.id !== place?.id) this.nearbyPlace = place;
      });
    }
    if (!this.accessGranted && this.elapsed >= this.duration / 2) {
      this.zone.run(() => { this.pause(); void this.checkFullAccess(); });
    } else if (this.elapsed >= this.duration) {
      this.zone.run(() => { this.pause(); this.completed = true; });
      void this.finishRecording(true);
    } else {
      this.raf = requestAnimationFrame(next => this.tick(next));
    }
  }

  private async checkFullAccess(): Promise<void> {
    if (this.checkingAccess || this.destroyed) return;
    this.checkingAccess = true;
    const gate = await this.animationAccess.claimFullPlayback();
    if (this.destroyed) return;
    this.checkingAccess = false;
    if (gate) {
      await this.finishRecording(false);
      this.gate = gate;
    } else {
      this.accessGranted = true;
      void this.play();
    }
  }

  private interpolateCamera(a: FlightCamera, b: FlightCamera, t: number): FlightCamera {
    const s = t * t * (3 - 2 * t);
    return { center: [a.center[0] + (b.center[0] - a.center[0]) * s, a.center[1] + (b.center[1] - a.center[1]) * s],
      zoom: a.zoom + (b.zoom - a.zoom) * s, pitch: a.pitch + (b.pitch - a.pitch) * s,
      bearing: a.bearing + angleDelta(a.bearing, b.bearing) * s };
  }

  private applyCamera(camera: FlightCamera, dt: number): void {
    if (!this.map) return;
    let elevation = this.terrainAvailable ? this.map.queryTerrainElevation(camera.center) : 0;
    // MapLibre returns zero when a DEM tile has not arrived yet. Keep the current
    // altitude until it loads, without treating genuine sea-level terrain as missing.
    if (this.terrainAvailable && elevation === 0 && !this.map.isSourceLoaded('elevation')) elevation = null;
    this.cameraElevation = advanceDiscoveryElevation(this.cameraElevation, elevation, dt);
    this.map.jumpTo({ ...camera, elevation: this.cameraElevation });
  }

  private drawRoute(distance: number): void {
    if (!this.map || (distance === this.drawnDistance && distance !== 0)) return;
    while (this.drawnIndex + 1 < this.lineDistances.length && this.lineDistances[this.drawnIndex + 1] <= distance) this.drawnIndex++;
    const point = sampleDiscoveryRoute(this.routeData, distance);
    const coordinates = distance > 0 ? [...this.lineCoordinates.slice(0, this.drawnIndex + 1), [point.lon, point.lat] as [number, number]] : [];
    (this.map.getSource('progress') as GeoJSONSource).setData(this.lineData(coordinates));
    this.drawnDistance = distance;
  }

  private lineData(coordinates: [number, number][]): GeoJSON.FeatureCollection<GeoJSON.LineString> {
    return { type: 'FeatureCollection', features: coordinates.length < 2 ? [] : [
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }
    ] };
  }

  private async finishRecording(download: boolean): Promise<void> {
    if (!this.ownsRecording || this.finishingRecording) return;
    this.finishingRecording = true;
    this.preparing = true;
    try {
      const blob = await this.recorder.stopAndGetBlob();
      if (download && !this.destroyed) this.recorder.downloadBlob(blob, 'descubrir-ruta');
    } catch {
      if (!this.destroyed) this.zone.run(() => { this.notice = selectedUiText('recordingSaveFailed'); });
    } finally {
      this.zone.run(() => { this.ownsRecording = false; this.finishingRecording = false; this.preparing = false; });
    }
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void { if (document.hidden && this.playing) this.pause(); }

  goBack(): void {
    const returnTo = workspaceReturnUrl(this.activatedRoute.snapshot.queryParamMap.get('returnTo'));
    if (returnTo) { void this.router.navigateByUrl(returnTo); return; }
    void this.router.navigate(['/load'], { queryParams: { view: 'animate' } });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearLoadTimeout();
    this.placesAbort?.abort();
    this.pause();
    this.resizeObserver?.disconnect();
    this.map?.remove();
    this.map = undefined;
    void this.finishRecording(false);
    this.audio.removeAttribute('src');
    this.audio.load();
  }
}
