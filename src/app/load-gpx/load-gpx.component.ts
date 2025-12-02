import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { DialogoConfiguracionComponent } from '../dialogo-configuracion/dialogo-configuracion.component';
import { DialogoConfiguracionData } from '../interfaces/estructuras';
import { TrackMetadataDialogComponent, TrackMetadataDialogResult } from '../track-metadata-dialog/track-metadata-dialog.component';
import { RouteMismatchDialogComponent } from '../route-mismatch-dialog/route-mismatch-dialog.component';

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

@Component({
  selector: 'app-load-gpx',
  templateUrl: './load-gpx.component.html',
  styleUrls: ['./load-gpx.component.css']
})
export class LoadGpxComponent implements OnInit {
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  readonly maxTracks = 5;
  private readonly overlapThreshold = 0.65;
  private readonly overlapProximityMeters = 150;
  isDragOver = false;
  tracks: LoadedTrack[] = [];

  constructor(
    public dialog: MatDialog,
    private router: Router) { }

  ngOnInit() {
    // Aquí se pueden inicializar cosas necesarias
    //this.startBackgroundMusic()
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

    const availableSlots = this.maxTracks - this.tracks.length;
    if (availableSlots <= 0) {
      alert(`Puedes cargar como máximo ${this.maxTracks} archivos GPX a la vez.`);
      return;
    }

    const files = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.gpx')).slice(0, availableSlots);
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


  async parseGPX(gpxData: string, file: File): Promise<void> {
    const parser = new DOMParser();
    const gpx = parser.parseFromString(gpxData, 'application/xml');
    const trkpts = gpx.getElementsByTagName('trkpt');

    let totalDistance = 0;
    let totalAscent = 0;
    let previousElevation: number | null = null;
    let elevations: number[] = [];
    let firstTime: string | null = null;

    for (let i = 0; i < trkpts.length; i++) {
      const ele = parseFloat(trkpts[i].getElementsByTagName('ele')[0]?.textContent || '0');
      const time = trkpts[i].getElementsByTagName('time')[0]?.textContent || '';
      const lat = parseFloat(trkpts[i].getAttribute('lat')!);
      const lon = parseFloat(trkpts[i].getAttribute('lon')!);
      const hrElement = trkpts[i].getElementsByTagName('ns3:hr')[0];
      const hr = hrElement ? parseInt(hrElement.textContent || '0') : null;

      if (i === 0) {
        firstTime = time;
      }

      elevations.push(ele);
      if (previousElevation !== null) {
        const elevationDiff = ele - previousElevation;
        if (elevationDiff > 0) { // Considerar solo las subidas
          totalAscent += elevationDiff;
        }
      }
      previousElevation = ele;
    }

    const date = firstTime ? new Date(firstTime).toLocaleString() : new Date().toLocaleString();

    const newTrack: LoadedTrack = {
      name: file.name.replace(/\.[^.]+$/, ''),
      color: this.pickColor(this.tracks.length),
      fileName: file.name,
      details: {
        date: date,
        distance: this.calculateTotalDistance(trkpts),
        ascent: totalAscent // Ascenso acumulado
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

    const updatedTracks = [...this.tracks, newTrack];
    if (await this.shouldAbortBecauseOfRouteMismatch(updatedTracks)) {
      return;
    }

    this.tracks = updatedTracks;
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
    return totalDistance / 1000; // Convertir a kilómetros
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distancia en metros
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
      alert('Carga al menos un track.');
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
        data: {  // opcional: valores por defecto
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
        if (!result) return; // pulsó Cancelar o cerró el diálogo

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
          // 👉 Guardamos TODO en sessionStorage para evitar URLs enormes
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

          // Navegamos con una URL corta
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
              // usa tu helper (ancho o alto como prefieras)
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
            : Math.min(1, targetHeight / img.naturalHeight); // no ampliar si es más pequeño

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
    return total > 0 ? total * 60 : 45 * 60; // por defecto 45 minutos
  }

  private velocidadSegunPendiente(porcentaje: number): number {
    if (porcentaje > 6) return 10;      // km/h
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

    // Suaviza cambios bruscos de velocidad aplicando una media móvil sobre las pendientes.
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
      return Math.max(0.5, media); // evita saltos por velocidades demasiado bajas
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




}
