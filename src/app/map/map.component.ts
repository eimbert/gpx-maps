import { Component, OnInit, AfterViewInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import * as L from 'leaflet';
import { RecorderService } from '../recording/recorder.service';

interface TrackPoint { lat: number; lon: number; ele: number; time: string; }
interface TPx extends TrackPoint { t: number; }

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
  private  inicioMapa: any;
  private musicEnabled = true;
  private recordingEnabled = false;
  private recordingAspect: '16:9' | '9:16' = '16:9';
  isVerticalViewport = false;

  // Capas: ghost + progreso + marcador actual
  private full1!: L.Polyline; private prog1!: L.Polyline; private mark1!: L.Marker;
  private full2!: L.Polyline; private prog2!: L.Polyline; private mark2!: L.Marker;

  // Grupos de “ticks” (marcas de tiempo)
  private ticks1!: L.LayerGroup;
  private ticks2!: L.LayerGroup;

  private raw1: TrackPoint[] = []; private raw2: TrackPoint[] = [];
  private t1: TPx[] = []; private t2: TPx[] = [];

  private i1 = 0;   // último punto real alcanzado
  private i2 = 0;
  private relMs = 0;
  private rafId = 0;
  private started = false;

  // Ambos terminan aprox. en este tiempo de reproducción
  private desiredDurationSec = 30;
  private replaySpeed = 1;

  // Ticks dinámicos cada 30 min
  private readonly TICK_STEP_MS = 30 * 60 * 1000;
  private nextTickRel1 = this.TICK_STEP_MS;
  private nextTickRel2 = this.TICK_STEP_MS;

  // Flags para añadir la marca final solo una vez
  private finalAdded1 = false;
  private finalAdded2 = false;

  colors: string[] = ['blue', 'red'];
  names: string[] = ['Track 1', 'Track 2'];

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
      if (this.speedMs(prev, cur) <= 16.67 /* ~60 km/h */) out.push(cur);
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

    if (payload) {
      this.names = Array.isArray(payload.names) ? payload.names : ['Track 1', 'Track 2'];
      this.colors = Array.isArray(payload.colors) ? payload.colors : ['blue', 'red'];
      const trks = Array.isArray(payload.tracks) ? payload.tracks : [];
      this.raw1 = (trks[0]?.trkpts ?? []) as TrackPoint[];
      this.raw2 = (trks[1]?.trkpts ?? []) as TrackPoint[];
      this.logoDataUrl = payload.logo ?? null;
      this.removeStops = !!payload.rmstops;
      this.musicEnabled = payload.activarMusica ?? true;
      this.recordingEnabled = !!payload.grabarAnimacion;
      if (payload.relacionAspectoGrabacion === '9:16') {
        this.recordingAspect = '9:16';
      }
      this.isVerticalViewport = this.recordingAspect === '9:16';
    } else {
      // Fallback (por si alguien entra directo a /map sin pasar por /load)
      this.route.queryParams.subscribe(params => {
        try { this.names = JSON.parse(params['names'] ?? '["Track 1","Track 2"]'); } catch { }
        try { this.colors = JSON.parse(params['colors'] ?? '["blue","red"]'); } catch { }
        try {
          const trks = JSON.parse(params['tracks'] ?? '[]');
          this.raw1 = (trks?.[0]?.trkpts ?? []) as TrackPoint[];
          this.raw2 = (trks?.[1]?.trkpts ?? []) as TrackPoint[];
        } catch { this.raw1 = []; this.raw2 = []; }
        this.logoDataUrl = (params['logo'] ?? null) as string | null;
        this.removeStops = (params['rmstops'] === '1' || params['rmstops'] === 'true');
      });
    }

    // 2) Sanitizar y aplicar compresión de paradas si procede
    this.t1 = this.sanitize(this.raw1);
    this.t2 = this.sanitize(this.raw2);

    console.log('[init] rmstops?', this.removeStops, 't1 len:', this.t1.length, 't2 len:', this.t2.length);

    if (this.removeStops) {
      this.t1 = this.removeStopsAdaptive(this.t1, 20_000, 4, 10, 25, 12, 1_500);
      this.t2 = this.removeStopsAdaptive(this.t2, 20_000, 4, 10, 25, 12, 1_500);
      console.log('[init] after removeStopsByStep t1 len:', this.t1.length, 't2 len:', this.t2.length);
    }
  }


  ngAfterViewInit(): void {
    
    this.initMap();
    setTimeout(() => {
      this.applyAspectViewport().then(() => {
        this.inicioMapa = this.startIfReady();
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
      if(this.inicioMapa != null){
        this.afterInicio(this.inicioMapa.has1, this.inicioMapa.has2)
      }
    } catch (e) {
      console.error('No se pudo iniciar la captura:', e);
      // Puedes seguir sin grabar si quieres:
      this.showStartOverlay = false;
      if(this.inicioMapa != null){
        this.afterInicio(this.inicioMapa.has1, this.inicioMapa.has2)
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
    this.renderer = L.canvas({ padding: 0.25 });

    const ghost = (color: string): L.PolylineOptions => ({
      color, weight: 2, opacity: 0.25, renderer: this.renderer, interactive: false, fill: false, stroke: true
    });
    const prog = (color: string): L.PolylineOptions => ({
      color, weight: 4, opacity: 0.95, renderer: this.renderer, interactive: false, fill: false, stroke: true
    });

    this.full1 = L.polyline([], ghost(this.colors[0])).addTo(this.map);
    this.prog1 = L.polyline([], prog(this.colors[0])).addTo(this.map);

    this.full2 = L.polyline([], ghost(this.colors[1])).addTo(this.map);
    this.prog2 = L.polyline([], prog(this.colors[1])).addTo(this.map);

    const mk = (c: string) => L.divIcon({
      className: 'custom-circle-icon',
      html: `<div style="width:14px;height:14px;background:${c};border-radius:50%"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9]
    });
    this.mark1 = L.marker([0, 0], { icon: mk(this.colors[0]) });
    this.mark2 = L.marker([0, 0], { icon: mk(this.colors[1]) });

    // Grupos para ticks
    this.ticks1 = L.layerGroup().addTo(this.map);
    this.ticks2 = L.layerGroup().addTo(this.map);
  }

  private startIfReady(): any {
    if (this.started) return;

    const has1 = this.t1.length >= 2;
    const has2 = this.t2.length >= 2;
    if (!has1 && !has2) return; // nada que animar

    // pinta “ghost” de los que existan
    const boundsPts: L.LatLng[] = [];
    if (has1) {
      const l1 = this.t1.map(p => L.latLng(p.lat, p.lon));
      this.full1.setLatLngs(l1);
      boundsPts.push(...l1);
    } else {
      this.full1.setLatLngs([]);
      this.prog1.setLatLngs([]);
    }
    if (has2) {
      const l2 = this.t2.map(p => L.latLng(p.lat, p.lon));
      this.full2.setLatLngs(l2);
      boundsPts.push(...l2);
    } else {
      this.full2.setLatLngs([]);
      this.prog2.setLatLngs([]);
    }

    // encuadre con lo disponible
    const union = L.latLngBounds(boundsPts);
    if (union.isValid()) this.map.fitBounds(union.pad(0.05));

    // arranque y estado inicial
    this.ticks1.clearLayers();
    this.ticks2.clearLayers();
    this.nextTickRel1 = this.TICK_STEP_MS;
    this.nextTickRel2 = this.TICK_STEP_MS;
    this.finalAdded1 = false;
    this.finalAdded2 = false;

    
    if (has1) {
      this.prog1.setLatLngs([[this.t1[0].lat, this.t1[0].lon]]);
      this.mark1.setLatLng([this.t1[0].lat, this.t1[0].lon]).addTo(this.map);
      this.i1 = 0;
    }
    if (has2) {
      this.prog2.setLatLngs([[this.t2[0].lat, this.t2[0].lon]]);
      this.mark2.setLatLng([this.t2[0].lat, this.t2[0].lon]).addTo(this.map);
      this.i2 = 0;
    }


    // velocidad: que el más largo termine aprox. en desiredDurationSec
    const d1 = has1 ? (this.t1[this.t1.length - 1].t - this.t1[0].t) : 0;
    const d2 = has2 ? (this.t2[this.t2.length - 1].t - this.t2[0].t) : 0;
    const maxDur = Math.max(d1, d2);
    this.replaySpeed = maxDur > 0 ? maxDur / (this.desiredDurationSec * 1000) : 8;
    if (!Number.isFinite(this.replaySpeed) || this.replaySpeed <= 0) this.replaySpeed = 8;

    this.relMs = 0;
    this.started = true;

    return {has1, has2}
  }
  
  afterInicio (has1: any, has2: any){
      let last = performance.now();
      const step = (now: number) => {
        const rawDt = now - last; last = now;
        const dt = Math.min(rawDt, 50);
        this.relMs += dt * this.replaySpeed;

        let allDone = true;

        if (has1) {
          const start1 = this.t1[0].t, end1 = this.t1[this.t1.length - 1].t;
          const tAbs1 = start1 + this.relMs;

          while (this.i1 + 1 < this.t1.length && this.t1[this.i1 + 1].t <= tAbs1) this.i1++;

          // ticks dinámicos 30 min (reservando el final)
          const rel1 = tAbs1 - start1;
          const endRel1 = end1 - start1;
          while (this.nextTickRel1 <= rel1 && this.nextTickRel1 < endRel1) {
            const absTick1 = start1 + this.nextTickRel1;
            this.addTickAtAbs(this.t1, absTick1, this.colors[0], this.ticks1, start1);
            this.nextTickRel1 += this.TICK_STEP_MS;
          }

          const pos1 = this.positionAt(this.t1, tAbs1, { i: this.i1 });
          const path1: [number, number][] = this.t1.slice(0, this.i1 + 1).map(p => [p.lat, p.lon]);
          path1.push([pos1[0], pos1[1]]);
          this.prog1.setLatLngs(path1);
          this.mark1.setLatLng(pos1);

          const done1 = this.i1 >= this.t1.length - 1 && tAbs1 >= end1;
          if (done1 && !this.finalAdded1) { this.addFinalTick(this.t1, this.colors[0], this.ticks1, start1); this.finalAdded1 = true; }
          if (!done1) allDone = false;
        }

        if (has2) {
          const start2 = this.t2[0].t, end2 = this.t2[this.t2.length - 1].t;
          const tAbs2 = start2 + this.relMs;

          while (this.i2 + 1 < this.t2.length && this.t2[this.i2 + 1].t <= tAbs2) this.i2++;

          const rel2 = tAbs2 - start2;
          const endRel2 = end2 - start2;
          while (this.nextTickRel2 <= rel2 && this.nextTickRel2 < endRel2) {
            const absTick2 = start2 + this.nextTickRel2;
            this.addTickAtAbs(this.t2, absTick2, this.colors[1], this.ticks2, start2);
            this.nextTickRel2 += this.TICK_STEP_MS;
          }

          const pos2 = this.positionAt(this.t2, tAbs2, { i: this.i2 });
          const path2: [number, number][] = this.t2.slice(0, this.i2 + 1).map(p => [p.lat, p.lon]);
          path2.push([pos2[0], pos2[1]]);
          this.prog2.setLatLngs(path2);
          this.mark2.setLatLng(pos2);

          const done2 = this.i2 >= this.t2.length - 1 && tAbs2 >= end2;
          if (done2 && !this.finalAdded2) { this.addFinalTick(this.t2, this.colors[1], this.ticks2, start2); this.finalAdded2 = true; }
          if (!done2) allDone = false;
        }

        if (!allDone) {
          this.rafId = requestAnimationFrame(step);
        } else {
          cancelAnimationFrame(this.rafId);
          this.audio?.pause();        
          this.stopRecordingAndDownload()  
        }
      };

      this.rafId = requestAnimationFrame(step);
      
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

}
