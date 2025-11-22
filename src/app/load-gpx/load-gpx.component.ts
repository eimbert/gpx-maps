import { Component, AfterViewInit, OnInit, AfterContentInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import Chart from 'chart.js/auto';
import { DialogoConfiguracionComponent } from '../dialogo-configuracion/dialogo-configuracion.component';
import { DialogoConfiguracionData } from '../interfaces/estructuras';

interface TrackPoint {
  lat: number;
  lon: number;
  ele: number;
  time: string;
  hr: number | null;
}

@Component({
  selector: 'app-load-gpx',
  templateUrl: './load-gpx.component.html',
  styleUrls: ['./load-gpx.component.css']
})
export class LoadGpxComponent implements OnInit, AfterViewInit, AfterContentInit {
  colors: string[] = ['#0000ff', '#ff0000'];
  tracks: any[] = [null, null];
  trackLoaded: boolean[] = [false, false];
  trackDetails: { date: string, distance: number, ascent: number }[] = [
    { date: '', distance: 0, ascent: 0 },
    { date: '', distance: 0, ascent: 0 }
  ];
  // load-gpx.component.ts (añade propiedad)
  fileNames: string[] = ['Track 1', 'Track 2'];

  constructor(
    public dialog: MatDialog,
    private router: Router) { }

  ngAfterContentInit(): void {

  }

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

  ngAfterViewInit() {
    // Inicializar gráficos aquí si los datos ya están disponibles
    if (this.trackLoaded[0]) {
      this.initChart('chart-0', this.tracks[0].elevations);
    }
    if (this.trackLoaded[1]) {
      this.initChart('chart-1', this.tracks[1].elevations);
    }

  }

  cargarFichero(index: number): void {
    let input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx';

    input.onchange = _ => {
      if (input.files) {
        this.onFileSelected(input.files[0], index);
      }
    };
    input.click();
  }

  // en onFileSelected(...)
  onFileSelected(file: File, index: number): void {
    this.fileNames[index] = file.name.replace(/\.[^.]+$/, ''); // nombre sin extensión
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const gpxData = e.target.result as string;
      this.parseGPX(gpxData, index);
    };
    reader.readAsText(file);
  }


  parseGPX(gpxData: string, index: number): void {
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

    this.trackDetails[index] = {
      date: date,
      distance: this.calculateTotalDistance(trkpts),
      ascent: totalAscent // Ascenso acumulado
    };

    this.tracks[index] = {
      elevations,
      trkpts: Array.from(trkpts).map((trkpt: Element) => ({
        lat: parseFloat(trkpt.getAttribute('lat')!),
        lon: parseFloat(trkpt.getAttribute('lon')!),
        ele: parseFloat(trkpt.getElementsByTagName('ele')[0]?.textContent || '0'),
        time: trkpt.getElementsByTagName('time')[0]?.textContent || '',
        hr: trkpt.getElementsByTagName('ns3:hr')[0] ? parseInt(trkpt.getElementsByTagName('ns3:hr')[0].textContent || '0') : null
      }))
    };
    this.trackLoaded[index] = true;

    // Esperar un breve momento para asegurarse de que el DOM se haya actualizado antes de inicializar el gráfico
    setTimeout(() => {
      this.initChart(`chart-${index}`, elevations);
    }, 200);
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

  initChart(chartId: string, data: number[]): void {
    const ctx = document.getElementById(chartId) as HTMLCanvasElement;
    if (ctx) {
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map((_, i) => i),
          datasets: [{
            label: '',
            data: data,
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1, // Hacer la línea más fina
            fill: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: {
            x: {
              display: false
            },
            y: {
              beginAtZero: true
            }
          },
          plugins: {
            legend: {
              display: false // Eliminar la leyenda
            }
          }
        }
      });
    }
  }



  borrarFichero(index: number): void {
    this.tracks[index] = null;
    this.trackLoaded[index] = false;
    this.trackDetails[index] = { date: '', distance: 0, ascent: 0 };
  }

  tracksCargados(): boolean {
    return this.trackLoaded.some(Boolean);
  }

  // private navegarAlMapa(
  //   namesPayload: string[],
  //   colorsPayload: string[],
  //   tracksPayload: Array<{ trkpts: any[] }>,
  //   logoDataUrl: string | null,
  //   removeStops: boolean
  // ): void {
  //   const query: any = {
  //     names: JSON.stringify(namesPayload),
  //     colors: JSON.stringify(colorsPayload),
  //     tracks: JSON.stringify(tracksPayload)
  //   };
  //   if (logoDataUrl) query.logo = logoDataUrl;
  //   if (removeStops) query.rmstops = '1';   // ← flag para “quitar paradas”
  //   this.router.navigate(['/map'], { queryParams: query });
  // }

  iniciarVisualizacion(): void {
    const loadedIdx = this.tracks
      .map((t, i) => (t && this.trackLoaded[i]) ? i : -1)
      .filter(i => i >= 0);

    if (loadedIdx.length === 0) {
      alert('Carga al menos un track.');
      return;
    }

    const permiteAdversarioVirtual = this.trackLoaded[0] && !this.trackLoaded[1];

    const tracksPayload = loadedIdx.map(i => ({
      trkpts: this.tracks[i].trkpts.map((p: any) => ({
        lat: p.lat, lon: p.lon, ele: p.ele, time: p.time, hr: p.hr ?? null
      }))
    }));
    const namesPayload = loadedIdx.map(i => this.fileNames[i] ?? `Track ${i + 1}`);
    const colorsPayload = loadedIdx.map(i => this.colors[i] ?? '#0000ff');

    this.cuadroConfiguracion(namesPayload, colorsPayload, tracksPayload, permiteAdversarioVirtual)

  }

  cuadroConfiguracion(namesPayload: any, colorsPayload: any, tracksPayload: any, permitirAdversarioVirtual: boolean) {
    this.dialog.open<DialogoConfiguracionComponent, Partial<DialogoConfiguracionData>, DialogoConfiguracionData>(
      DialogoConfiguracionComponent,
      {
        width: '520px',
        height: '520px',
        data: {  // opcional: valores por defecto
          eliminarPausasLargas: false,
          anadirLogoTitulos: false,
          permitirAdversarioVirtual,
          colors: this.colors
        }
      }
    )
      .afterClosed()
      .subscribe((result) => {
        if (!result) return; // pulsó Cancelar o cerró el diálogo
        colorsPayload = result.colors;

        let tracksFinal = tracksPayload;
        let namesFinal = namesPayload;
        const colorsFinal = colorsPayload.slice();

        if (permitirAdversarioVirtual && result.incluirAdversarioVirtual) {
          const objetivoSegundos = this.parsearTiempoObjetivo(result.tiempoAdversarioVirtual ?? '00:45');
          const virtualTrack = this.generarAdversarioVirtual(this.tracks[0], objetivoSegundos);
          if (virtualTrack) {
            tracksFinal = [tracksPayload[0], virtualTrack];
            namesFinal = [namesPayload[0], 'Adversario virtual'];
            if (!colorsFinal[1]) {
              colorsFinal[1] = '#ff0000';
            }
          }
        }

        const afterLogo = (logoDataUrl: string | null) => {
          // 👉 Guardamos TODO en sessionStorage para evitar URLs enormes
          const payload = { names: namesFinal, colors: colorsFinal, tracks: tracksFinal, logo: logoDataUrl, rmstops: !!result.eliminarPausasLargas };
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

  private generarAdversarioVirtual(track: any, objetivoSegundos: number): { trkpts: any[] } | null {
    if (!track?.trkpts || track.trkpts.length < 2) return null;

    const puntos = track.trkpts as any[];
    const baseDuraciones: number[] = [];

    for (let i = 1; i < puntos.length; i++) {
      const dist = this.calculateDistance(puntos[i - 1].lat, puntos[i - 1].lon, puntos[i].lat, puntos[i].lon);
      const deltaEle = (puntos[i].ele ?? 0) - (puntos[i - 1].ele ?? 0);
      const pendiente = dist > 0 ? (deltaEle / dist) * 100 : 0;
      const velocidadKmh = this.velocidadSegunPendiente(pendiente);
      const velocidadMs = velocidadKmh / 3.6;
      const duracion = velocidadMs > 0 ? dist / velocidadMs : 0;
      baseDuraciones.push(Number.isFinite(duracion) && duracion > 0 ? duracion : 1);
    }

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
