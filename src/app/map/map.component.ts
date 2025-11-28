import { Component, OnInit, AfterViewInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import * as L from 'leaflet';
import { RecorderService } from '../recording/recorder.service';

interface TrackPoint { lat: number; lon: number; ele: number; time: string; }
interface TPx extends TrackPoint { t: number; }

interface TrackMeta {
  name: string;
  color: string;
  raw: TrackPoint[];
  sanitized: TPx[];
  full?: L.Polyline;
  prog?: L.Polyline;
  mark?: L.Marker;
  ticks?: L.LayerGroup;
  cursor: number;
  nextTickRel: number;
  finalAdded: boolean;
  has: boolean;
}

interface RankingEntry {
  name: string;
  color: string;
  durationMs: number;
  medal?: 'gold' | 'silver' | 'bronze';
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

  showStartOverlay = true;
  private startArmed = false;
  private audio!: HTMLAudioElement;
  private hasTracksReady = false;
  private musicEnabled = true;
  private recordingEnabled = false;
  private recordingAspect: '16:9' | '9:16' = '16:9';
  isVerticalViewport = false;
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
  private readonly ghostOpacity = 0.4;
  private readonly ghostWeight = 3;
  private readonly progressOpacity = 0.95;
  private readonly zoomPlaybackFactor = 0.3;
  private readonly zoomPanSlowdownFactor = 2;
  private lastLeaderTarget: L.LatLng | null = null;
  private allTracksBounds: L.LatLngBounds | null = null;
  private readonly maxReasonableSpeedMs = 45; // ~162 km/h, evita descartar puntos válidos en coche

  trackMetas: TrackMeta[] = [];
  private relMs = 0;
  private rafId = 0;
  private started = false;

  // Ambos terminan aprox. en este tiempo de reproducción
  private desiredDurationSec = 30;
  private replaySpeed = 1;

  // Ticks dinámicos cada 30 min
  private readonly TICK_STEP_MS = 30 * 60 * 1000;

  colors: string[] = [];
  names: string[] = [];

  constructor(
    private route: ActivatedRoute,
    public rec: RecorderService) { }

  // ---------- util ----------
  private getVideoDimensions(): { width: number; height: number } {
    return this.recordingAspect === '9:16'
      ? { width: 1440, height: 2560 }
      : { width: 2560, height: 1440 };
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
    const xs = arr
      .filter(p => this.isCoordValid(p.lat, p.lon) && Number.isFinite(this.ms(p.time)))
      .map(p => ({ ...p, t: this.ms(p.time) }))
      .sort((a, b) => a.t - b.t);

    if (xs.length < 2) return xs;
    const out: TPx[] = [xs[0]];
    for (let i = 1; i < xs.length; i++) {
      const prev = out[out.length - 1], cur = xs[i];
      if (this.speedMs(prev, cur) <= this.maxReasonableSpeedMs) out.push(cur);
    }
    return out;
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
    dot.bindTooltip(this.fmtHMin(absT - startAbs), {
      permanent: true,
      direction: 'right',
      offset: L.point(8, 0),
      className: 'tick-label'
    });
    group.addLayer(dot);
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
    dot.bindTooltip(this.fmtHMin(endAbs - startAbs), {
      permanent: true,
      direction: 'right',
      offset: L.point(10, 0),
      className: 'tick-label tick-label-final'
    });
    group.addLayer(dot);
  }

  // ---------- lifecycle ----------
  ngOnInit(): void {
    // 1) Intentamos cargar el payload desde sessionStorage
    let payload: any = null;
    try { payload = JSON.parse(sessionStorage.getItem('gpxViewerPayload') || 'null'); } catch { payload = null; }

    const defaultColors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6'];

    const buildMetas = (names: string[], colors: string[], tracks: any[]) => {
      this.trackMetas = tracks.map((track, index) => ({
        name: names[index] ?? `Track ${index + 1}`,
        color: colors[index] ?? defaultColors[index % defaultColors.length],
        raw: (track?.trkpts ?? []) as TrackPoint[],
        sanitized: [],
        cursor: 0,
        nextTickRel: this.TICK_STEP_MS,
        finalAdded: false,
        has: false,
      }));
    };

    if (payload) {
      this.names = Array.isArray(payload.names) ? payload.names : [];
      this.colors = Array.isArray(payload.colors) ? payload.colors : [];
      const trks = Array.isArray(payload.tracks) ? payload.tracks : [];
      buildMetas(this.names, this.colors, trks);
      this.logoDataUrl = payload.logo ?? null;
      this.removeStops = !!payload.rmstops;
      this.musicEnabled = payload.activarMusica ?? true;
      this.recordingEnabled = !!payload.grabarAnimacion;
      if (payload.relacionAspectoGrabacion === '9:16') {
        this.recordingAspect = '9:16';
      }
      this.visualizationMode = payload.modoVisualizacion === 'zoomCabeza' ? 'zoomCabeza' : 'general';
      this.isVerticalViewport = this.recordingAspect === '9:16';
    } else {
      // Fallback (por si alguien entra directo a /map sin pasar por /load)
      this.route.queryParams.subscribe(params => {
        try { this.names = JSON.parse(params['names'] ?? '[]'); } catch { this.names = []; }
        try { this.colors = JSON.parse(params['colors'] ?? '[]'); } catch { this.colors = []; }
        let trks: any[] = [];
        try { trks = JSON.parse(params['tracks'] ?? '[]'); } catch { trks = []; }
        buildMetas(this.names, this.colors, trks);
        this.logoDataUrl = (params['logo'] ?? null) as string | null;
        this.removeStops = (params['rmstops'] === '1' || params['rmstops'] === 'true');
      });
    }

    // 2) Sanitizar y aplicar compresión de paradas si procede
    this.trackMetas = this.trackMetas.map((meta) => {
      let sanitized = this.sanitize(meta.raw);
      if (this.removeStops) {
        sanitized = this.removeStopsAdaptive(sanitized, 20_000, 4, 10, 25, 12, 1_500);
      }
      return { ...meta, sanitized };
    });
  }


  ngAfterViewInit(): void {
    
    this.initMap();
    setTimeout(() => {
      this.applyAspectViewport().then(() => {
        this.hasTracksReady = this.startIfReady();
      });
    }, 0);

     this.audio = document.getElementById('background-music-carrera') as HTMLAudioElement;

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

  async onStartClick(): Promise<void> {
    try {
      this.showRanking = false;
      this.ranking = [];
      await this.applyAspectViewport();

      // 1) Empieza la grabación (elige “Pestaña” y marca audio de la pestaña)
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

      // 2) Arranca música (ya hay interacción del usuario)
      if (this.musicEnabled) {
        await this.audio.play().catch(() => { /* ignore */ });
      }

      // 3) Lanza tu animación normal
      this.showStartOverlay = false;
      // arrancar animación si ya están los datos
      if (this.hasTracksReady) {
        this.afterInicio();
      }
    } catch (e) {
      console.error('No se pudo iniciar la captura:', e);
      // Puedes seguir sin grabar si quieres:
      this.showStartOverlay = false;
      if (this.hasTracksReady) {
        this.afterInicio();
      }
    }
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
    this.map = L.map('map', { preferCanvas: true }).setView([40.4168, -3.7038], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(this.map);
    this.renderer = L.canvas({ padding: 0.25 }).addTo(this.map);

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
      full: L.polyline([], ghost(meta.color)).addTo(this.map),
      prog: L.polyline([], prog(meta.color)).addTo(this.map),
      mark: L.marker([0, 0], { icon: mk(meta.color) }),
      ticks: L.layerGroup().addTo(this.map)
    }));
  }

  private startIfReady(): boolean {
    if (this.started) return false;

    this.showRanking = false;
    this.ranking = [];

    const boundsPts: L.LatLng[] = [];
    let anyTrack = false;

    this.trackMetas.forEach((meta) => {
      meta.has = meta.sanitized.length >= 2;
      meta.cursor = 0;
      meta.nextTickRel = this.TICK_STEP_MS;
      meta.finalAdded = false;

      if (meta.has && meta.full && meta.prog && meta.mark && meta.ticks) {
        const latlngs = meta.sanitized.map(p => L.latLng(p.lat, p.lon));
        const startLatLng = latlngs[0];
        meta.full.setLatLngs(latlngs);
        meta.prog.setLatLngs([startLatLng]);
        meta.mark.setLatLng(startLatLng).addTo(this.map);
        meta.ticks.clearLayers();
        boundsPts.push(...latlngs);
        anyTrack = true;
      } else if (meta.full && meta.prog && meta.ticks) {
        meta.full.setLatLngs([]);
        meta.prog.setLatLngs([]);
        meta.ticks.clearLayers();
      }
    });

    this.applyTrackVisibility();

    const union = L.latLngBounds(boundsPts);
    this.allTracksBounds = union.isValid() ? union.pad(0.05) : null;
    if (this.allTracksBounds) {
      this.map.fitBounds(this.allTracksBounds, {
        padding: [24, 24],
        maxZoom: this.leaderZoomLevel - 1
      });
      const currentZoom = this.map.getZoom();
      const targetZoom = Math.min(this.leaderZoomLevel - 1, currentZoom + 1);
      if (targetZoom > currentZoom) {
        this.map.setZoom(targetZoom);
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

    let last = performance.now();
    const step = (now: number) => {
      const rawDt = now - last; last = now;
      const dt = Math.min(rawDt, 50);
      this.relMs += dt * this.replaySpeed;

      let allDone = true;

      this.trackMetas.forEach((meta) => {
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

        const done = meta.cursor >= meta.sanitized.length - 1 && tAbs >= end;
        if (done && !meta.finalAdded) { this.addFinalTick(meta.sanitized, meta.color, meta.ticks, start); meta.finalAdded = true; }
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

  private setGeneralView(): void {
    if (!this.map) return;
    if (this.allTracksBounds && this.allTracksBounds.isValid()) {
      this.map.flyToBounds(this.allTracksBounds, { animate: true, duration: 0.7 });
    }
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
    const viewBounds = this.map.getBounds().pad(-0.2);
    const zoomMismatch = this.map.getZoom() < this.leaderZoomLevel;

    if (viewBounds.contains(target) && !zoomMismatch) {
      this.lastLeaderTarget = target;
      return;
    }

    const movedEnough = !this.lastLeaderTarget || this.lastLeaderTarget.distanceTo(target) > 5;
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

  // Detecta paradas de forma adaptativa: (A) pasos cortos acumulados y (B) intervalos únicos largos.
  // Luego comprime el timeline restando la duración de cada parada a los puntos siguientes.
  private removeStopsAdaptive(
    xs: TPx[],
    minStopMs = 15_000,  // duración mínima para contar como parada
    stepRadius = 4,      // (A) salto máximo entre puntos “quieto”
    stayRadius = 10,     // (A) deriva máxima desde el inicio de la parada
    pathSumMax = 25,     // (A) distancia acumulada máxima dentro de la parada
    sparseStayRadius = 12, // (B) radio para considerar que un solo intervalo largo es “quieto”
    mergeGapMs = 1500      // fusiona paradas separadas por gaps cortos
  ): TPx[] {
    console.log('[StopsAdaptive] ENTER len=', xs?.length);
    if (!xs || xs.length < 2) { console.log('[StopsAdaptive] EXIT early'); return xs?.slice() ?? []; }

    const dist = (a: TPx, b: TPx) => this.hav(a.lat, a.lon, b.lat, b.lon);

    type Stop = { start: number; end: number; dur: number, sumDist?: number, maxRad?: number };
    const raw: Stop[] = [];

    // --- (A) Parada por pasos cortos + deriva + distancia acumulada ---
    let inStop = false, startIdx = 0;
    let anchor = xs[0];
    let dur = 0, sumDist = 0, maxRad = 0;

    for (let i = 1; i < xs.length; i++) {
      const dt = xs[i].t - xs[i - 1].t;
      if (dt <= 0) continue;
      const dStep = dist(xs[i], xs[i - 1]);
      const r = dist(xs[i], anchor);

      if (!inStop) {
        if (dStep <= stepRadius) {
          inStop = true;
          startIdx = i - 1;
          anchor = xs[startIdx];
          dur = dt; sumDist = dStep; maxRad = r;
        }
      } else {
        if (dStep <= stepRadius && r <= stayRadius) {
          dur += dt; sumDist += dStep; if (r > maxRad) maxRad = r;
        } else {
          if (dur >= minStopMs && maxRad <= stayRadius && sumDist <= pathSumMax) {
            raw.push({ start: startIdx, end: i - 1, dur, sumDist, maxRad });
          }
          inStop = false; dur = 0; sumDist = 0; maxRad = 0;
        }
      }
    }
    if (inStop && dur >= minStopMs && maxRad <= stayRadius && sumDist <= pathSumMax) {
      raw.push({ start: startIdx, end: xs.length - 1, dur, sumDist, maxRad });
    }

    // --- (B) Parada por intervalo único largo (pocos puntos/sampling bajo) ---
    for (let i = 1; i < xs.length; i++) {
      const dt = xs[i].t - xs[i - 1].t;
      if (dt >= minStopMs) {
        const d = dist(xs[i], xs[i - 1]);
        if (d <= sparseStayRadius) {
          raw.push({ start: i - 1, end: i, dur: dt });
        }
      }
    }

    if (raw.length === 0) { console.log('[StopsAdaptive] no stops'); return xs.slice(); }

    // Ordenar y fusionar paradas (solapes o gaps cortos en la misma zona)
    raw.sort((a, b) => a.start - b.start);
    const merged: Stop[] = [];
    const sameArea = (a: Stop, b: Stop) => dist(xs[a.start], xs[b.start]) <= Math.max(stayRadius, sparseStayRadius);

    for (const s of raw) {
      if (!merged.length) { merged.push({ ...s }); continue; }
      const prev = merged[merged.length - 1];
      const overlap = s.start <= prev.end;
      const gapMs = xs[s.start].t - xs[prev.end].t;
      if (overlap || (gapMs > 0 && gapMs <= mergeGapMs && sameArea(prev, s))) {
        prev.end = Math.max(prev.end, s.end);
        prev.dur += (overlap ? 0 : gapMs) + s.dur;
      } else {
        merged.push({ ...s });
      }
    }

    // Comprimir timeline y eliminar puntos intermedios de cada parada
    const out: TPx[] = [];
    let paused = 0, idx = 0;
    for (let i = 0; i < xs.length; i++) {
      if (idx < merged.length && i === merged[idx].start) {
        out.push({ ...xs[i], t: xs[i].t - paused });
        paused += merged[idx].dur;
        i = merged[idx].end;
        idx++;
        continue;
      }
      out.push({ ...xs[i], t: xs[i].t - paused });
    }

    const totalPaused = merged.reduce((a, s) => a + s.dur, 0);
    console.log('[StopsAdaptive] paradas:', merged.length,
      'tiempo comprimido (s):', Math.round(totalPaused / 1000),
      { minStopMs, stepRadius, stayRadius, pathSumMax, sparseStayRadius, mergeGapMs });
    return out;
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
