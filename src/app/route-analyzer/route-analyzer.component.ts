import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { TrackGpxFile } from '../interfaces/events';
import { RouteAnalysis, RouteAnalysisHighlight, RouteAnalysisReport, RouteAnalysisSector } from '../interfaces/route-analysis';
import { EventService } from '../services/event.service';
import { RouteAnalysisService } from '../services/route-analysis.service';
import { AuthService, EntitlementsResponse } from '../services/auth.service';

interface AnalyzerPoint {
  lat: number;
  lon: number;
  ele: number;
  distanceKm: number;
}

interface AnalyzerStats {
  distanceKm: number;
  elevationGain: number;
  elevationLoss: number;
  minEle: number;
  maxEle: number;
  points: number;
}

interface SvgPoint {
  x: number;
  y: number;
}

interface TrackProjection {
  points: SvgPoint[];
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  width: number;
  height: number;
  padding: number;
}

interface SectorBand extends RouteAnalysisSector {
  x: number;
  width: number;
  colorIndex: number;
}

interface SectorPath extends RouteAnalysisSector {
  path: string;
  colorIndex: number;
}

interface ProfileTick {
  x: number;
  label: string;
  anchor: 'start' | 'middle' | 'end';
}

interface ProfileSectorLabel {
  x: number;
  label: string;
  effort: RouteAnalysisSector['effort'];
  colorIndex: number;
}

@Component({
  selector: 'app-route-analyzer',
  templateUrl: './route-analyzer.component.html',
  styleUrls: ['./route-analyzer.component.css']
})
export class RouteAnalyzerComponent implements OnInit {
  @ViewChild('analysisExport') private analysisExport?: ElementRef<HTMLElement>;

  fileName: string | null = null;
  routeTitle = 'Ruta analizada';
  routeXml: string | null = null;
  trackId: number | null = null;
  source: 'upload' | 'tracks' | 'plan' = 'upload';
  userInstructions = '';
  isAnalyzing = false;
  isCalculatingElevation = false;
  statusMessage: string | null = null;
  analysis: RouteAnalysis | null = null;
  stats: AnalyzerStats | null = null;
  points: AnalyzerPoint[] = [];
  trackPath = '';
  profilePath = '';
  highlightMarkers: Array<RouteAnalysisHighlight & { x: number; y: number }> = [];
  profileMarkers: Array<RouteAnalysisHighlight & { x: number; y: number }> = [];
  sectorBands: SectorBand[] = [];
  sectorPaths: SectorPath[] = [];
  profileTicks: ProfileTick[] = [];
  profileSectorLabels: ProfileSectorLabel[] = [];
  startMarker: SvgPoint | null = null;
  endMarker: SvgPoint | null = null;
  isExportingPdf = false;
  entitlements: EntitlementsResponse | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private eventService: EventService,
    private routeAnalysisService: RouteAnalysisService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadEntitlements();
    const state = (typeof window !== 'undefined' ? window.history.state : null) ?? {};
    const queryTrackId = Number(this.route.snapshot.queryParamMap.get('trackId'));
    this.trackId = Number.isFinite(queryTrackId) ? queryTrackId : this.toNullableNumber(state.trackId);
    this.source = state.source ?? (this.route.snapshot.queryParamMap.get('source') as any) ?? 'upload';
    this.fileName = state.fileName ?? null;
    this.routeTitle = this.cleanRouteTitle(state.routeTitle);

    if (typeof state.routeXml === 'string' && state.routeXml.trim()) {
      this.loadRouteXml(state.routeXml, this.fileName, this.trackId, this.source);
      return;
    }

    if (this.trackId) {
      this.statusMessage = 'Cargando GPX del track...';
      this.eventService.getTrackGpx(this.trackId).subscribe({
        next: (gpxFile: TrackGpxFile) => {
          if (!gpxFile.routeXml) {
            this.statusMessage = 'No se encontró GPX para analizar.';
            return;
          }
          this.loadRouteXml(gpxFile.routeXml, gpxFile.fileName ?? this.fileName, gpxFile.id, this.source);
        },
        error: () => this.statusMessage = 'No se pudo cargar el GPX del track.'
      });
    }
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      this.loadRouteXml(content, file.name, null, 'upload');
    };
    reader.readAsText(file);
    input.value = '';
  }

  analyze(forceRefresh = false): void {
    if (!this.routeXml) {
      this.statusMessage = 'Sube o selecciona una ruta GPX para analizar.';
      return;
    }
    if (!this.canGenerateAnalysis) {
      this.statusMessage = 'No tienes saldo disponible para generar un nuevo informe.';
      return;
    }

    this.isAnalyzing = true;
    this.statusMessage = 'Analizando ruta...';
    const payload = {
      trackId: this.trackId,
      source: this.source,
      fileName: this.fileName,
      title: this.routeTitle,
      routeXml: this.routeXml,
      userInstructions: this.normalizedInstructions(),
      forceRefresh
    };
    console.info('[RouteAnalyzer] Enviando análisis IA', {
      trackId: payload.trackId,
      source: payload.source,
      fileName: payload.fileName,
      routeXmlChars: payload.routeXml.length,
      hasInstructions: !!payload.userInstructions,
      forceRefresh: payload.forceRefresh
    });
    this.routeAnalysisService.analyzeRoute(payload).pipe(
      catchError((error: unknown) => {
        console.error('[RouteAnalyzer] Error llamando al backend de análisis', error);
        const report = this.buildLocalReport();
        const detail = this.describeAnalysisError(error);
        return of({
          id: null,
          trackId: this.trackId,
          model: 'local-fallback',
          userInstructions: this.normalizedInstructions(),
          errorDetail: detail,
          report
        } as RouteAnalysis & { errorDetail: string });
      })
    ).subscribe((analysis: RouteAnalysis & { errorDetail?: string }) => {
      this.isAnalyzing = false;
      this.analysis = analysis;
      this.applyAnalyzedElevation(analysis);
      const fallbackReason = analysis.fallbackReason ?? analysis.errorDetail ?? 'revisa la respuesta/logs del backend';
      this.statusMessage = analysis.model === 'local-fallback'
        ? `OpenAI no ha generado el informe (${fallbackReason}). Mostrando análisis técnico local provisional; no se ha descontado ningún uso.`
        : analysis.usageCharged
          ? 'Nuevo análisis generado: se ha descontado 1 uso de tu saldo.'
          : 'Este informe ya estaba generado: puedes consultarlo sin descontar usos de tu saldo.';
      this.updateAnalysisVisuals();
      this.loadEntitlements();
    });
  }

  get canGenerateAnalysis(): boolean {
    const limits = this.entitlements;
    if (!limits || limits.administrator) return true;
    return limits.aiAnalysesUsedLastSixHours < limits.aiAnalysesPerSixHours
      && limits.aiAnalysesUsedThisMonth < limits.aiAnalysesPerMonth;
  }

  get generateTooltip(): string {
    return this.canGenerateAnalysis ? '' : 'Sin saldo para generar informes';
  }

  private cleanRouteTitle(value: unknown): string {
    const title = typeof value === 'string' ? value.trim() : '';
    return title && !/^activity(?:[_\-\s]|$)/i.test(title) ? title : 'Ruta analizada';
  }

  get routeTypeLabel(): string {
    const value = this.analysis?.report.routeType;
    const labels: Record<string, string> = {
      rodadora: 'Rodadora',
      tecnica: 'Técnica',
      subida_dura: 'Subida dura',
      mixta: 'Mixta',
      suave: 'Suave',
      exigente: 'Exigente'
    };
    return value ? labels[value] ?? value : '-';
  }

  get elevationSourceLabel(): string | null {
    const source = this.analysis?.elevationSource;
    if (!source || source === 'gpx') return null;
    if (source === 'opentopodata-eudem25m') return 'OpenTopoData EU-DEM';
    if (source === 'gpx-unreliable') return 'GPX no fiable';
    return source;
  }

  formatKm(value: number | null | undefined): string {
    return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} km` : '-';
  }

  async downloadPdf(): Promise<void> {
    try {
      const blob = await this.createPdfBlob();
      this.saveBlob(blob, this.pdfFileName());
      this.statusMessage = 'PDF del informe descargado.';
    } catch (error) {
      console.error('[RouteAnalyzer] No se pudo generar el PDF', error);
      this.statusMessage = 'No se pudo generar el PDF del informe.';
    }
  }

  async shareReport(): Promise<void> {
    const text = this.shareText();
    try {
      const blob = await this.createPdfBlob();
      const file = new File([blob], this.pdfFileName(), { type: 'application/pdf' });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData & { files?: File[] }) => boolean;
        share?: (data: ShareData & { files?: File[] }) => Promise<void>;
      };
      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({ title: 'Informe Tracketeo', text, files: [file] });
        this.statusMessage = 'Informe compartido.';
        return;
      }
      if (nav.share) {
        await nav.share({ title: 'Informe Tracketeo', text, url: window.location.href });
        this.statusMessage = 'Enlace del informe compartido.';
        return;
      }
      await navigator.clipboard?.writeText(`${text}\n${window.location.href}`);
      this.statusMessage = 'No hay compartir nativo; he copiado el texto del informe al portapapeles.';
    } catch (error) {
      console.error('[RouteAnalyzer] No se pudo compartir el informe', error);
      this.statusMessage = 'No se pudo compartir el informe.';
    }
  }

  async shareWhatsApp(): Promise<void> {
    const text = this.shareText();
    try {
      const blob = await this.createPdfBlob();
      const file = new File([blob], this.pdfFileName(), { type: 'application/pdf' });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData & { files?: File[] }) => boolean;
        share?: (data: ShareData & { files?: File[] }) => Promise<void>;
      };
      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({ title: 'Informe Tracketeo', text, files: [file] });
        this.statusMessage = 'Informe listo para enviar por WhatsApp.';
        return;
      }
      this.saveBlob(blob, this.pdfFileName());
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      this.statusMessage = 'PDF descargado. En escritorio, adjúntalo manualmente en WhatsApp Web.';
    } catch (error) {
      console.error('[RouteAnalyzer] No se pudo preparar WhatsApp', error);
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      this.statusMessage = 'No se pudo adjuntar PDF automáticamente; he abierto WhatsApp con el resumen.';
    }
  }

  async shareEmail(): Promise<void> {
    const subject = `Informe Tracketeo - ${this.fileName || 'ruta GPX'}`;
    const body = this.shareText();
    try {
      const blob = await this.createPdfBlob();
      const file = new File([blob], this.pdfFileName(), { type: 'application/pdf' });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData & { files?: File[] }) => boolean;
        share?: (data: ShareData & { files?: File[] }) => Promise<void>;
      };
      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({ title: subject, text: body, files: [file] });
        this.statusMessage = 'Informe listo para enviar por email.';
        return;
      }
      this.saveBlob(blob, this.pdfFileName());
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${body}\n\nPDF descargado: adjúntalo a este correo.`)}`;
      this.statusMessage = 'PDF descargado. Adjunta el archivo al correo que se ha abierto.';
    } catch (error) {
      console.error('[RouteAnalyzer] No se pudo preparar email', error);
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      this.statusMessage = 'No se pudo generar el PDF; he abierto un email con el resumen.';
    }
  }

  get hasApproaches(): boolean {
    const approaches = this.analysis?.report.approaches;
    return !!approaches && Object.values(approaches).some(items => Array.isArray(items) && items.length > 0);
  }

  private normalizedInstructions(): string | null {
    const value = this.userInstructions.trim();
    return value ? value.slice(0, 1200) : null;
  }

  private async createPdfBlob(): Promise<Blob> {
    const element = this.analysisExport?.nativeElement;
    if (!element || !this.analysis) {
      throw new Error('No hay informe preparado para exportar');
    }
    this.isExportingPdf = true;
    this.statusMessage = 'Preparando PDF del informe...';
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.setProperties({
        title: `Informe Tracketeo - ${this.fileName || 'ruta GPX'}`,
        subject: 'Informe inteligente de ruta',
        creator: 'tracketeo.bike'
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const gap = 6;
      const contentWidth = pdfWidth - margin * 2;
      const contentHeight = pdfHeight - margin * 2;
      let cursorY = margin;
      const sections = Array.from(element.querySelectorAll<HTMLElement>('.analyzer__pdf-section'));

      for (const section of sections) {
        const canvas = await html2canvas(section, {
          scale: Math.min(2, window.devicePixelRatio || 1.5),
          backgroundColor: '#eef2f7',
          useCORS: true,
          logging: false
        });
        const imgHeight = (canvas.height * contentWidth) / canvas.width;

        if (imgHeight <= contentHeight) {
          if (cursorY > margin && cursorY + imgHeight > pdfHeight - margin) {
            pdf.addPage();
            cursorY = margin;
          }
          this.addCanvasToPdfPage(pdf, canvas, margin, cursorY, contentWidth, imgHeight);
          cursorY += imgHeight + gap;
          continue;
        }

        if (cursorY > margin) {
          pdf.addPage();
          cursorY = margin;
        }
        cursorY = this.addTallCanvasToPdf(pdf, canvas, margin, contentWidth, contentHeight) + gap;
        if (cursorY > pdfHeight - margin) {
          pdf.addPage();
          cursorY = margin;
        }
      }
      return pdf.output('blob');
    } finally {
      this.isExportingPdf = false;
    }
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private addCanvasToPdfPage(pdf: any, canvas: HTMLCanvasElement, x: number, y: number, width: number, height: number): void {
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', x, y, width, height);
  }

  private addTallCanvasToPdf(pdf: any, canvas: HTMLCanvasElement, margin: number, contentWidth: number, contentHeight: number): number {
    const pageSlicePx = Math.floor((contentHeight / contentWidth) * canvas.width);
    let sourceY = 0;
    let lastSliceBottom = margin;
    while (sourceY < canvas.height) {
      const sliceHeight = Math.min(pageSlicePx, canvas.height - sourceY);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const context = slice.getContext('2d');
      if (!context) {
        throw new Error('No se pudo preparar una página del PDF');
      }
      context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      const pdfSliceHeight = (sliceHeight * contentWidth) / canvas.width;
      this.addCanvasToPdfPage(pdf, slice, margin, margin, contentWidth, pdfSliceHeight);
      lastSliceBottom = margin + pdfSliceHeight;
      sourceY += sliceHeight;
      if (sourceY < canvas.height) {
        pdf.addPage();
      }
    }
    return lastSliceBottom;
  }

  private pdfFileName(): string {
    const base = (this.fileName || 'informe-tracketeo')
      .replace(/\.[^.]+$/, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'informe-tracketeo';
    return `${base}-tracketeo.pdf`;
  }

  private shareText(): string {
    const summary = this.analysis?.report.summary ?? 'Informe inteligente de ruta Tracketeo.';
    const stats = this.stats
      ? `${this.stats.distanceKm.toFixed(1)} km, ${Math.round(this.stats.elevationGain)} m D+`
      : 'ruta GPX analizada';
    return `Informe Tracketeo de ${this.fileName || 'ruta GPX'}: ${stats}. ${summary}`;
  }

  private loadRouteXml(routeXml: string, fileName: string | null, trackId: number | null, source: 'upload' | 'tracks' | 'plan'): void {
    this.routeXml = routeXml;
    this.fileName = fileName;
    this.trackId = trackId;
    this.source = source;
    this.analysis = null;
    this.statusMessage = null;
    this.points = this.parseGpx(routeXml);
    if (this.points.length < 2) {
      this.statusMessage = 'El GPX no contiene suficientes puntos.';
      this.stats = null;
      this.profileTicks = [];
      this.profileSectorLabels = [];
      return;
    }
    this.stats = this.calculateStats(this.points);
    this.updateTrackPath();
    this.updateProfilePath();
    this.updateAnalysisVisuals();
    this.calculateMissingElevation();
    if (trackId) {
      this.routeAnalysisService.getTrackAnalysis(trackId).pipe(catchError(() => of(null))).subscribe(saved => {
        if (saved) {
          this.applyExistingAnalysis(saved);
        } else this.lookupExistingAnalysis();
      });
    } else this.lookupExistingAnalysis();
  }

  private lookupExistingAnalysis(): void {
    if (!this.routeXml) return;
    this.routeAnalysisService.lookupExisting({
      trackId: this.trackId,
      source: this.source,
      fileName: this.fileName,
      title: this.routeTitle,
      routeXml: this.routeXml
    }).pipe(catchError(() => of(null))).subscribe(saved => {
      if (saved) this.applyExistingAnalysis(saved);
    });
  }

  private applyExistingAnalysis(saved: RouteAnalysis): void {
    this.analysis = saved;
    this.applyAnalyzedElevation(saved);
    this.statusMessage = 'Este informe ya estaba generado: se ha cargado automáticamente y no consume saldo.';
    this.updateAnalysisVisuals();
  }

  private loadEntitlements(): void {
    this.authService.getEntitlements().subscribe({
      next: limits => this.entitlements = limits,
      error: () => this.entitlements = null
    });
  }

  private calculateMissingElevation(): void {
    if (!this.routeXml || this.points.length < 2 || this.hasUsableElevation(this.points)) return;
    this.isCalculatingElevation = true;
    this.statusMessage = 'Calculando altimetría del terreno...';
    this.routeAnalysisService.calculateElevation({
      trackId: this.trackId,
      source: this.source,
      fileName: this.fileName,
      routeXml: this.routeXml
    }).pipe(catchError(error => {
      console.error('[RouteAnalyzer] No se pudo calcular la altimetría', error);
      return of(null);
    })).subscribe(routeStats => {
      this.isCalculatingElevation = false;
      if (!routeStats || routeStats.elevationProfile.length < 2 || routeStats.maxEleM - routeStats.minEleM < 1) {
        this.statusMessage = 'No se pudo obtener la altimetría del terreno.';
        return;
      }
      this.applyAnalyzedElevation({ report: this.analysis?.report ?? this.buildLocalReport(), routeStats });
      this.statusMessage = 'Altimetría del terreno calculada.';
      this.updateAnalysisVisuals();
    });
  }

  private hasUsableElevation(points: AnalyzerPoint[]): boolean {
    const elevations = points.map(point => point.ele).filter(Number.isFinite);
    if (elevations.length < 2) return false;
    const nonZero = elevations.filter(value => Math.abs(value) > 0.1).length;
    return nonZero > Math.max(2, points.length / 20) && Math.max(...elevations) - Math.min(...elevations) >= 10;
  }

  private applyAnalyzedElevation(analysis: RouteAnalysis): void {
    const routeStats = analysis.routeStats;
    const profile = routeStats?.elevationProfile ?? [];
    if (!routeStats || profile.length < 2 || !this.points.length) return;

    let profileIndex = 0;
    for (const point of this.points) {
      while (profileIndex < profile.length - 2 && profile[profileIndex + 1].distanceKm < point.distanceKm) {
        profileIndex += 1;
      }
      const start = profile[profileIndex];
      const end = profile[Math.min(profileIndex + 1, profile.length - 1)];
      const span = end.distanceKm - start.distanceKm;
      const ratio = span > 0 ? Math.max(0, Math.min(1, (point.distanceKm - start.distanceKm) / span)) : 0;
      point.ele = start.elevationM + (end.elevationM - start.elevationM) * ratio;
    }
    this.stats = {
      distanceKm: routeStats.distanceKm,
      elevationGain: routeStats.elevationGainM,
      elevationLoss: routeStats.elevationLossM,
      minEle: routeStats.minEleM,
      maxEle: routeStats.maxEleM,
      points: this.points.length
    };
    this.updateProfilePath();
  }

  private parseGpx(gpx: string): AnalyzerPoint[] {
    const xml = new DOMParser().parseFromString(gpx, 'application/xml');
    const nodes = Array.from(xml.getElementsByTagName('trkpt'));
    const raw = nodes.map(node => ({
      lat: Number(node.getAttribute('lat')),
      lon: Number(node.getAttribute('lon')),
      ele: this.parseNumber(node.getElementsByTagName('ele')[0]?.textContent ?? 0),
      distanceKm: 0
    })).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon));

    let distance = 0;
    for (let index = 1; index < raw.length; index += 1) {
      distance += this.distanceMeters(raw[index - 1], raw[index]) / 1000;
      raw[index].distanceKm = distance;
    }
    return raw;
  }

  private calculateStats(points: AnalyzerPoint[]): AnalyzerStats {
    let minEle = Number.POSITIVE_INFINITY;
    let maxEle = Number.NEGATIVE_INFINITY;
    for (const point of points) {
      minEle = Math.min(minEle, point.ele);
      maxEle = Math.max(maxEle, point.ele);
    }
    const elevation = this.calculateElevationTotals(points, {
      stepMeters: 20,
      smoothWindowMeters: 40,
      minStepMeters: 0.25
    });
    let elevationGain = elevation.gain;
    let elevationLoss = elevation.loss;
    if (elevationGain < 1 && Number.isFinite(maxEle - minEle) && maxEle - minEle > 8) {
      elevationGain = maxEle - minEle;
    }
    return {
      distanceKm: points[points.length - 1]?.distanceKm ?? 0,
      elevationGain,
      elevationLoss,
      minEle,
      maxEle,
      points: points.length
    };
  }

  private calculateElevationTotals(
    points: AnalyzerPoint[],
    opts: { stepMeters: number; smoothWindowMeters: number; minStepMeters: number; maxJumpMeters?: number }
  ): { gain: number; loss: number } {
    if (points.length < 2) {
      return { gain: 0, loss: 0 };
    }
    const { ele } = this.resampleByDistance(points, opts.stepMeters);
    const windowPoints = Math.max(3, Math.round(opts.smoothWindowMeters / opts.stepMeters));
    const smooth = this.movingAverageCentered(ele, windowPoints);
    const maxJumpMeters = opts.maxJumpMeters ?? 50;
    let gain = 0;
    let loss = 0;
    let prev = smooth[0];
    for (let index = 1; index < smooth.length; index += 1) {
      let diff = smooth[index] - prev;
      if (Math.abs(diff) > maxJumpMeters) {
        diff = 0;
      }
      if (diff > opts.minStepMeters) {
        gain += diff;
      } else if (diff < -opts.minStepMeters) {
        loss += Math.abs(diff);
      }
      prev = smooth[index];
    }
    return { gain, loss };
  }

  private resampleByDistance(points: AnalyzerPoint[], stepMeters: number): { dist: number[]; ele: number[] } {
    const totalMeters = (points[points.length - 1]?.distanceKm ?? 0) * 1000;
    if (totalMeters <= 0) {
      return { dist: [0], ele: [points[0]?.ele ?? 0] };
    }
    const dist: number[] = [];
    const ele: number[] = [];
    let segment = 0;
    for (let target = 0; target <= totalMeters; target += stepMeters) {
      while (segment < points.length - 2 && points[segment + 1].distanceKm * 1000 < target) {
        segment += 1;
      }
      const start = points[segment];
      const end = points[Math.min(segment + 1, points.length - 1)];
      const startMeters = start.distanceKm * 1000;
      const endMeters = end.distanceKm * 1000;
      const length = Math.max(1e-9, endMeters - startMeters);
      const ratio = (target - startMeters) / length;
      dist.push(target);
      ele.push(start.ele + (end.ele - start.ele) * ratio);
    }
    if (dist[dist.length - 1] < totalMeters) {
      dist.push(totalMeters);
      ele.push(points[points.length - 1].ele);
    }
    return { dist, ele };
  }

  private movingAverageCentered(values: number[], windowPoints: number): number[] {
    if (!values.length) {
      return [];
    }
    let size = Math.max(3, windowPoints);
    if (size % 2 === 0) {
      size += 1;
    }
    const half = Math.floor(size / 2);
    return values.map((_, index) => {
      let total = 0;
      for (let offset = -half; offset <= half; offset += 1) {
        const valueIndex = Math.max(0, Math.min(values.length - 1, index + offset));
        total += values[valueIndex];
      }
      return total / size;
    });
  }

  private buildLocalReport(): RouteAnalysisReport {
    const stats = this.stats;
    const hardClimbs = this.findClimbHighlights();
    const routeType = !stats ? 'mixta' : stats.elevationGain > 1200 ? 'subida_dura' : stats.elevationGain > 700 ? 'exigente' : 'mixta';
    return {
      summary: stats
        ? `Ruta de ${stats.distanceKm.toFixed(1)} km con ${Math.round(stats.elevationGain)} m de desnivel positivo.`
        : 'Ruta GPX preparada para análisis.',
      routeType,
      difficultyExplanation: stats
        ? `La dificultad viene marcada por la relación entre distancia y desnivel: ${Math.round(stats.elevationGain)} m positivos repartidos en ${stats.distanceKm.toFixed(1)} km.`
        : 'No hay suficientes datos para explicar la dureza.',
      highlights: hardClimbs,
      warnings: stats && stats.elevationGain > 900 ? ['Revisa el reparto del desnivel y reserva energía para los tramos de subida.'] : [],
      recommendations: [
        'Usa los puntos numerados como referencias para decidir dónde regular, reagrupar o cambiar el ritmo.',
        'Revisa el perfil antes de salir: el valor está en anticipar los bloques duros, no en descubrirlos tarde.'
      ],
      sectors: this.buildLocalSectors(),
      approaches: this.buildLocalApproaches()
    };
  }

  private findClimbHighlights(): RouteAnalysisHighlight[] {
    if (!this.points.length) return [];
    const highlights: RouteAnalysisHighlight[] = [];
    const windowKm = 1.5;
    for (let start = 0; start < this.points.length; start += 25) {
      const startPoint = this.points[start];
      const end = this.points.findIndex(point => point.distanceKm >= startPoint.distanceKm + windowKm);
      if (end <= start) continue;
      const endPoint = this.points[end];
      const gain = endPoint.ele - startPoint.ele;
      const slope = (gain / (windowKm * 1000)) * 100;
      if (gain > 90 && slope > 5) {
        highlights.push({
          title: 'Subida destacada',
          description: `Tramo de ${windowKm.toFixed(1)} km con pendiente media aproximada del ${slope.toFixed(1)}%.`,
          kmStart: startPoint.distanceKm,
          kmEnd: endPoint.distanceKm,
          lat: startPoint.lat,
          lon: startPoint.lon,
          type: 'climb',
          severity: slope > 8 ? 'high' : 'medium'
        });
      }
      if (highlights.length >= 3) break;
    }
    return highlights;
  }

  private updateTrackPath(): void {
    const projected = this.projectTrack(760, 360).points;
    this.trackPath = this.buildSvgPath(projected);
  }

  private updateProfilePath(): void {
    if (!this.points.length) {
      this.profilePath = '';
      return;
    }
    const width = 760;
    const height = 160;
    const maxDistance = this.points[this.points.length - 1].distanceKm || 1;
    const elevations = this.points.map(point => point.ele);
    const minEle = Math.min(...elevations);
    const maxEle = Math.max(...elevations);
    const range = Math.max(1, maxEle - minEle);
    const profile = this.points.filter((_, index) => index % Math.max(1, Math.ceil(this.points.length / 350)) === 0)
      .map(point => ({
        x: (point.distanceKm / maxDistance) * width,
        y: height - ((point.ele - minEle) / range) * height
      }));
    this.profilePath = this.buildSvgPath(profile);
    this.profileTicks = this.buildProfileTicks(width);
  }

  private updateAnalysisVisuals(): void {
    const reportHighlights = this.analysis?.report.highlights ?? [];
    const reportSectors = this.analysis?.report.sectors ?? [];
    const projection = this.buildProjection(760, 360);
    this.startMarker = this.points[0] ? this.projectPoint(this.points[0], projection) : null;
    this.endMarker = this.points.length ? this.projectPoint(this.points[this.points.length - 1], projection) : null;
    this.highlightMarkers = reportHighlights.map(highlight => {
      const point = this.findPointForHighlight(highlight);
      return {
        ...highlight,
        ...this.projectPoint(point, projection)
      };
    });
    this.profileMarkers = reportHighlights.map(highlight => {
      const point = this.findPointForHighlight(highlight);
      return {
        ...highlight,
        ...this.projectProfilePoint(point, 760, 160)
      };
    });
    this.sectorBands = reportSectors.map((sector, index) => this.projectSectorBand(sector, index, 760));
    this.profileSectorLabels = reportSectors.map((sector, index) => this.projectSectorLabel(sector, index, 760));
    this.sectorPaths = reportSectors.map((sector, index) => ({
      ...sector,
      colorIndex: index,
      path: this.buildSvgPath(this.points
        .filter(point => point.distanceKm >= sector.kmStart && point.distanceKm <= sector.kmEnd)
        .filter((_, index, all) => index % Math.max(1, Math.ceil(all.length / 180)) === 0)
        .map(point => this.projectPoint(point, projection)))
    })).filter(sector => sector.path.length > 0);
  }

  private findPointForHighlight(highlight: RouteAnalysisHighlight): AnalyzerPoint {
    if (Number.isFinite(highlight.lat ?? NaN) && Number.isFinite(highlight.lon ?? NaN)) {
      return this.points.reduce((closest, current) =>
        this.distanceMeters(current, { lat: highlight.lat as number, lon: highlight.lon as number }) <
        this.distanceMeters(closest, { lat: highlight.lat as number, lon: highlight.lon as number }) ? current : closest
      , this.points[0]);
    }
    return this.points.reduce((closest, current) =>
      Math.abs(current.distanceKm - highlight.kmStart) < Math.abs(closest.distanceKm - highlight.kmStart) ? current : closest
    , this.points[0]);
  }

  private projectTrack(width: number, height: number): TrackProjection {
    const projection = this.buildProjection(width, height);
    projection.points = this.points
      .filter((_, index) => index % Math.max(1, Math.ceil(this.points.length / 600)) === 0)
      .map(point => this.projectPoint(point, projection));
    return projection;
  }

  private buildProjection(width: number, height: number): TrackProjection {
    const lats = this.points.map(point => point.lat);
    const lons = this.points.map(point => point.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const padding = 22;
    return { points: [], minLat, maxLat, minLon, maxLon, width, height, padding };
  }

  private projectPoint(point: AnalyzerPoint, projection: TrackProjection): SvgPoint {
    const latRange = Math.max(0.000001, projection.maxLat - projection.minLat);
    const lonRange = Math.max(0.000001, projection.maxLon - projection.minLon);
    return {
      x: projection.padding + ((point.lon - projection.minLon) / lonRange) * (projection.width - projection.padding * 2),
      y: projection.padding + ((projection.maxLat - point.lat) / latRange) * (projection.height - projection.padding * 2)
    };
  }

  private projectProfilePoint(point: AnalyzerPoint, width: number, height: number): SvgPoint {
    const maxDistance = this.points[this.points.length - 1]?.distanceKm || 1;
    const elevations = this.points.map(item => item.ele);
    const minEle = Math.min(...elevations);
    const maxEle = Math.max(...elevations);
    const range = Math.max(1, maxEle - minEle);
    return {
      x: (point.distanceKm / maxDistance) * width,
      y: height - ((point.ele - minEle) / range) * height
    };
  }

  private projectSectorBand(sector: RouteAnalysisSector, index: number, width: number): SectorBand {
    const maxDistance = this.points[this.points.length - 1]?.distanceKm || 1;
    const x = Math.max(0, Math.min(width, (sector.kmStart / maxDistance) * width));
    const endX = Math.max(0, Math.min(width, (sector.kmEnd / maxDistance) * width));
    return {
      ...sector,
      colorIndex: index,
      x,
      width: Math.max(3, endX - x)
    };
  }

  private projectSectorLabel(sector: RouteAnalysisSector, index: number, width: number): ProfileSectorLabel {
    const maxDistance = this.points[this.points.length - 1]?.distanceKm || 1;
    const centerKm = (sector.kmStart + sector.kmEnd) / 2;
    return {
      x: Math.max(24, Math.min(width - 24, (centerKm / maxDistance) * width)),
      label: `S${index + 1}`,
      effort: sector.effort,
      colorIndex: index
    };
  }

  private buildProfileTicks(width: number): ProfileTick[] {
    const maxDistance = this.points[this.points.length - 1]?.distanceKm || 0;
    if (maxDistance <= 0) {
      return [];
    }
    const rawStep = maxDistance <= 20 ? 2 : maxDistance <= 60 ? 5 : maxDistance <= 120 ? 10 : 20;
    const ticks: ProfileTick[] = [];
    for (let km = 0; km <= maxDistance; km += rawStep) {
      ticks.push({
        x: (km / maxDistance) * width,
        label: `${Math.round(km)} km`,
        anchor: km === 0 ? 'start' : 'middle'
      });
    }
    if (!ticks.length || Math.abs(maxDistance - Number(ticks[ticks.length - 1].label.replace(' km', ''))) > rawStep * 0.45) {
      ticks.push({
        x: width,
        label: `${maxDistance.toFixed(maxDistance < 10 ? 1 : 0)} km`,
        anchor: 'end'
      });
    }
    if (ticks.length > 1) {
      ticks[ticks.length - 1].anchor = 'end';
    }
    return ticks;
  }

  private buildSvgPath(points: SvgPoint[]): string {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  }

  private distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
    const radius = 6371000;
    const toRad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toRad;
    const dLon = (b.lon - a.lon) * toRad;
    const lat1 = a.lat * toRad;
    const lat2 = b.lat * toRad;
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  private toNullableNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseNumber(value: unknown): number {
    const parsed = Number(String(value ?? '0').trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private buildLocalSectors() {
    if (!this.stats) return [];
    const third = this.stats.distanceKm / 3;
    return [
      {
        name: 'Entrada en ruta',
        kmStart: 0,
        kmEnd: third,
        focus: 'Ajustar ritmo, leer el terreno y no gastar de más antes de que aparezcan los bloques duros.',
        effort: 'medio' as const
      },
      {
        name: 'Bloque central',
        kmStart: third,
        kmEnd: third * 2,
        focus: 'Gestionar los repechos señalados y recuperar en cada transición antes de volver a apretar.',
        effort: this.stats.elevationGain > 700 ? 'alto' as const : 'medio' as const
      },
      {
        name: 'Cierre',
        kmStart: third * 2,
        kmEnd: this.stats.distanceKm,
        focus: 'Llegar con margen para responder al cansancio acumulado y no perder fluidez al final.',
        effort: 'medio' as const
      }
    ];
  }

  private buildLocalApproaches() {
    return {
      recreational: [
        'Sal con ritmo cómodo y usa los puntos numerados como referencias para parar, reagrupar o comer algo.',
        'En las subidas destacadas prioriza cadencia y conversación: si dejas de poder hablar, baja un punto.'
      ],
      training: [
        'Convierte las subidas destacadas en bloques de tempo controlado y recupera en las zonas de enlace.',
        'No quemes el primer tercio: busca progresión y termina con sensación de haber podido apretar un poco más.'
      ],
      competition: [
        'Reserva los cambios de ritmo para los repechos señalados; son los lugares donde el esfuerzo tiene retorno.',
        'Reconoce antes las zonas críticas para decidir si atacar, regular o conservar rueda sin improvisar.'
      ]
    };
  }

  private describeAnalysisError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'sin conexión, CORS o backend no accesible';
      }
      return `HTTP ${error.status}`;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'error desconocido';
  }
}
