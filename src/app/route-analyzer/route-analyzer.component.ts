import { workspaceReturnUrl } from '../utils/workspace-return';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { TrackGpxFile } from '../interfaces/events';
import { RouteAnalysis, RouteAnalysisHighlight, RouteAnalysisReport, RouteAnalysisSector } from '../interfaces/route-analysis';
import { EventService } from '../services/event.service';
import { RouteAnalysisService } from '../services/route-analysis.service';
import { PlanService } from '../services/plan.service';
import { AuthService, EntitlementsResponse } from '../services/auth.service';
import { calculateGpxElevation, ElevationResult } from '../utils/gpx-elevation';
import { AppLanguage, resolveLanguage } from '../services/language.service';
import { REPORT_TEXTS, ReportTextKey } from './report-texts';
import { selectedUiText } from '../services/screen-texts';

interface AnalyzerPoint {
  lat: number;
  lon: number;
  ele: number;
  distanceKm: number;
  segment: number;
}

interface AnalyzerStats {
  distanceKm: number;
  elevationGain: number | null;
  elevationLoss: number | null;
  minEle: number | null;
  maxEle: number | null;
  points: number;
}

interface SvgPoint {
  x: number;
  y: number;
  segment?: number;
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
  styleUrls: ['./route-analyzer.component.css', './analysis-design.css']
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
  elevationResult: ElevationResult | null = null;
  private routeRevision = 0;
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
    private authService: AuthService,
    private planService: PlanService
  ) {}

  ngOnInit(): void {
    this.loadEntitlements();
    const state = (typeof window !== 'undefined' ? window.history.state : null) ?? {};
    const queryTrackId = this.toNullableNumber(this.route.snapshot.queryParamMap.get('trackId'));
    this.trackId = queryTrackId && queryTrackId > 0 ? queryTrackId : this.toNullableNumber(state.trackId);
    this.source = (this.route.snapshot.queryParamMap.get('source') as any) ?? state.source ?? (this.trackId ? 'tracks' : 'upload');
    this.fileName = state.fileName ?? null;
    this.routeTitle = this.cleanRouteTitle(state.routeTitle);

    if (typeof state.routeXml === 'string' && state.routeXml.trim()) {
      this.loadRouteXml(state.routeXml, this.fileName, this.trackId, this.source);
      return;
    }

    if (this.trackId) {
      this.statusMessage = selectedUiText('loadingTrackGpx');
      if (this.source === 'plan') {
        const folderId = Number(this.route.snapshot.queryParamMap.get('folderId'));
        if (!folderId) { this.statusMessage = selectedUiText('openRouteFromFolder'); return; }
        this.planService.getTracks(folderId).subscribe({
          next: tracks => {
            const track = tracks.find(item => item.id === this.trackId);
            if (!track?.routeXml) { this.statusMessage = selectedUiText('trackNotInFolder'); return; }
            this.routeTitle = track.name || this.routeTitle;
            this.loadRouteXml(track.routeXml, track.name, track.id, 'plan');
          },
          error: () => this.statusMessage = selectedUiText('plannedRouteLoadFailed')
        });
        return;
      }
      this.eventService.getTrackGpx(this.trackId).subscribe({
        next: (gpxFile: TrackGpxFile) => {
          if (!gpxFile.routeXml) {
            this.statusMessage = selectedUiText('noGpxToAnalyze');
            return;
          }
          this.loadRouteXml(gpxFile.routeXml, gpxFile.fileName ?? this.fileName, gpxFile.id, this.source);
        },
        error: () => this.statusMessage = selectedUiText('trackGpxLoadFailed')
      });
    }
  }

  goBack(): void {
    const returnTo = workspaceReturnUrl(this.route.snapshot.queryParamMap.get('returnTo'));
    if (returnTo) { void this.router.navigateByUrl(returnTo); return; }
    const source = this.route.snapshot.queryParamMap.get('source');
    if (source === 'tracks') {
      void this.router.navigate(['/load'], { queryParams: { view: 'archive' } });
    } else if (source === 'plan') {
      void this.router.navigate(['/plan'], { queryParams: { folderId: this.route.snapshot.queryParamMap.get('folderId') } });
    } else {
      void this.router.navigate(['/']);
    }
  }

  addAnalysisInstruction(value: string): void { this.userInstructions = [this.userInstructions, value].filter(Boolean).join('. ').slice(0,1200); }
  readonly analysisSuggestions = ['focusMtb', 'splitStages', 'technicalDescents'] as const;
  addSuggestedInstruction(key: typeof this.analysisSuggestions[number]): void { this.addAnalysisInstruction(selectedUiText(key)); }
  onAnalysisDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (!file || !/\.gpx$/i.test(file.name)) return;
    this.onFileSelected({ target: { files: [file], value: '' } } as unknown as Event);
  }
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      this.routeTitle = this.cleanRouteTitle(file.name.replace(/\.gpx$/i, ''));
      this.loadRouteXml(content, file.name, null, 'upload');
    };
    reader.readAsText(file);
    input.value = '';
  }

  analyze(forceRefresh = false): void {
    if (!this.routeXml) {
      this.statusMessage = selectedUiText('chooseGpxToAnalyze');
      return;
    }
    if (!this.canGenerateAnalysis) {
      this.statusMessage = selectedUiText('noReportCredit');
      return;
    }

    this.isAnalyzing = true;
    const revision = this.routeRevision;
    this.statusMessage = selectedUiText('analyzingRouteStatus');
    const payload = {
      trackId: this.trackId,
      source: this.source,
      fileName: this.fileName,
      title: this.routeTitle,
      routeXml: this.routeXml,
      userInstructions: this.normalizedInstructions(),
      reportLanguage: this.requestedReportLanguage,
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
        const report = this.buildLocalReport(payload.reportLanguage);
        const detail = this.describeAnalysisError(error);
        return of({
          id: null,
          trackId: this.trackId,
          model: 'local-fallback',
          userInstructions: this.normalizedInstructions(),
          reportLanguage: payload.reportLanguage,
          errorDetail: detail,
          report
        } as RouteAnalysis & { errorDetail: string });
      })
    ).subscribe((analysis: RouteAnalysis & { errorDetail?: string }) => {
      if (revision !== this.routeRevision) return;
      this.isAnalyzing = false;
      this.analysis = analysis;
      this.adoptSavedRoute(analysis);
      this.statusMessage = !analysis.id
        ? selectedUiText('reportNotSaved')
        : analysis.model?.startsWith('local')
        ? selectedUiText('technicalReportSaved')
        : analysis.usageCharged
          ? selectedUiText('analysisSavedCharged')
          : selectedUiText('analysisSavedFree');
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
    return this.canGenerateAnalysis ? '' : selectedUiText('noReportCredit');
  }

  get requestedReportLanguage(): AppLanguage {
    return resolveLanguage(typeof document === 'undefined' ? undefined : document.documentElement.lang);
  }

  get requestedReportLanguageName(): 'reportLanguageEnglish' | 'reportLanguageSpanish' | 'reportLanguageCatalan' | 'reportLanguageGalician' | 'reportLanguageBasque' {
    const keys: Record<AppLanguage, 'reportLanguageEnglish' | 'reportLanguageSpanish' | 'reportLanguageCatalan' | 'reportLanguageGalician' | 'reportLanguageBasque'> = {
      en: 'reportLanguageEnglish', es: 'reportLanguageSpanish', ca: 'reportLanguageCatalan',
      gl: 'reportLanguageGalician', eu: 'reportLanguageBasque'
    };
    return keys[this.requestedReportLanguage];
  }

  get reportDisplayLanguage(): AppLanguage {
    return this.analysis ? resolveLanguage(this.analysis.reportLanguage ?? 'es') : this.requestedReportLanguage;
  }

  reportText(key: ReportTextKey): string {
    return REPORT_TEXTS[key][this.reportDisplayLanguage];
  }

  private localReportText(key: ReportTextKey, language: AppLanguage): string {
    return REPORT_TEXTS[key][language];
  }

  private cleanRouteTitle(value: unknown): string {
    const title = typeof value === 'string' ? value.trim() : '';
    return title && !/^activity(?:[_\-\s]|$)/i.test(title) ? title : 'Ruta analizada';
  }

  get routeTypeLabel(): string {
    const value = this.analysis?.report.routeType;
    const labels: Record<string, ReportTextKey> = {
      rodadora: 'rolling', tecnica: 'technical', subida_dura: 'hardClimb',
      mixta: 'mixed', suave: 'easy', exigente: 'demanding', 'sin-altimetria': 'noAltimetry'
    };
    return value ? (labels[value] ? this.reportText(labels[value]) : value) : '-';
  }

  effortLabel(value: RouteAnalysisSector['effort']): string {
    const labels: Record<RouteAnalysisSector['effort'], ReportTextKey> = {
      suave: 'easy', medio: 'mediumEffort', alto: 'highEffort', critico: 'criticalEffort'
    };
    return this.reportText(labels[value]);
  }

  get elevationSourceLabel(): string | null {
    if (!this.elevationResult) return null;
    if (this.elevationResult.status === 'unavailable') return this.reportText('elevationUnavailable');
    if (this.elevationResult.status === 'partial') return this.reportText('elevationPartial');
    return this.reportText('elevationCalculated');
  }

  formatElevation(value: number | null | undefined): string {
    return value !== null && value !== undefined && Number.isFinite(value) ? `${Math.round(value)} m` : this.reportText('noElevation');
  }

  formatKm(value: number | null | undefined): string {
    return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} km` : '-';
  }

  async downloadPdf(): Promise<void> {
    try {
      const blob = await this.createPdfBlob();
      this.saveBlob(blob, this.pdfFileName());
      this.statusMessage = selectedUiText('pdfDownloaded');
    } catch (error) {
      console.error('[RouteAnalyzer] No se pudo generar el PDF', error);
      this.statusMessage = selectedUiText('pdfFailed');
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
        await nav.share({ title: this.reportText('reportTitle'), text, files: [file] });
        this.statusMessage = selectedUiText('reportShared');
        return;
      }
      if (nav.share) {
        await nav.share({ title: this.reportText('reportTitle'), text, url: window.location.href });
        this.statusMessage = selectedUiText('reportLinkShared');
        return;
      }
      await navigator.clipboard?.writeText(`${text}\n${window.location.href}`);
      this.statusMessage = selectedUiText('reportCopied');
    } catch (error) {
      console.error('[RouteAnalyzer] No se pudo compartir el informe', error);
      this.statusMessage = selectedUiText('reportShareFailed');
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
    this.statusMessage = selectedUiText('preparingPdf');
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.setProperties({
        title: `${this.reportText('reportTitle')} - ${this.fileName || this.reportText('gpxRoute')}`,
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
    const summary = this.analysis?.report.summary ?? this.reportText('routeAnalysis');
    const stats = this.stats
      ? `${this.stats.distanceKm.toFixed(1)} km, ${this.formatElevation(this.stats.elevationGain)}${this.stats.elevationGain !== null ? ' D+' : ''}`
      : this.reportText('preparedGpxRoute');
    return `${this.reportText('reportIntro')} ${this.fileName || this.reportText('gpxRoute')}: ${stats}. ${summary}`;
  }

  private loadRouteXml(routeXml: string, fileName: string | null, trackId: number | null, source: 'upload' | 'tracks' | 'plan'): void {
    const revision = ++this.routeRevision;
    this.isAnalyzing = false;
    this.routeXml = routeXml;
    this.fileName = fileName;
    this.trackId = trackId;
    this.source = source;
    this.analysis = null;
    this.statusMessage = null;
    this.stats = null;
    this.elevationResult = null;
    this.points = [];
    this.trackPath = '';
    this.profilePath = '';
    try {
      this.elevationResult = calculateGpxElevation(routeXml);
      this.points = this.parseGpx(routeXml);
    } catch {
      this.routeXml = null;
      this.statusMessage = selectedUiText('invalidGpx');
      return;
    }
    if (this.points.length < 2) {
      this.statusMessage = selectedUiText('insufficientGpxPoints');
      this.stats = null;
      this.profileTicks = [];
      this.profileSectorLabels = [];
      return;
    }
    this.stats = {
      distanceKm: this.elevationResult.distanceKm,
      elevationGain: this.elevationResult.gain,
      elevationLoss: this.elevationResult.loss,
      minEle: this.elevationResult.min,
      maxEle: this.elevationResult.max,
      points: this.points.length
    };
    this.updateTrackPath();
    this.updateProfilePath();
    this.updateAnalysisVisuals();
    if (trackId && source !== 'upload') {
      this.routeAnalysisService.getTrackAnalysis(trackId, source).pipe(catchError(() => of(null))).subscribe(saved => {
        if (revision !== this.routeRevision || this.isAnalyzing) return;
        if (saved) {
          this.applyExistingAnalysis(saved);
        }
      });
    } else this.lookupExistingAnalysis();
  }

  private lookupExistingAnalysis(): void {
    if (!this.routeXml) return;
    const revision = this.routeRevision;
    this.routeAnalysisService.lookupExisting({
      trackId: this.trackId,
      source: this.source,
      fileName: this.fileName,
      title: this.routeTitle,
      routeXml: this.routeXml,
      reportLanguage: this.requestedReportLanguage
    }).pipe(catchError(() => of(null))).subscribe(saved => {
      if (revision !== this.routeRevision || this.isAnalyzing) return;
      if (saved) this.applyExistingAnalysis(saved);
    });
  }

  private applyExistingAnalysis(saved: RouteAnalysis): void {
    this.analysis = saved;
    this.adoptSavedRoute(saved);
    this.statusMessage = selectedUiText('existingReportLoaded');
    this.updateAnalysisVisuals();
  }

  private adoptSavedRoute(analysis: RouteAnalysis): void {
    if (!analysis.id || !analysis.trackId || (analysis.source !== 'tracks' && analysis.source !== 'plan')) return;
    // Only uploads can acquire a new identity. Saved routes stay in their original workspace.
    if (this.source !== 'upload' && (analysis.source !== this.source || analysis.trackId !== this.trackId)) return;
    this.trackId = analysis.trackId;
    this.source = analysis.source;
    void this.router.navigate([], { relativeTo: this.route, replaceUrl: true,
      queryParams: { trackId: this.trackId, source: this.source, folderId: analysis.folderId ?? this.route.snapshot.queryParamMap.get('folderId') },
      queryParamsHandling: 'merge',
      state: { routeXml: this.routeXml, fileName: this.fileName, routeTitle: this.routeTitle, trackId: this.trackId, source: this.source }
    });
  }

  openSavedRoute(): void {
    if (!this.trackId || this.source === 'upload') return;
    if (this.source === 'plan') {
      this.router.navigate(['/plan'], { queryParams: { folderId: this.analysis?.folderId ?? this.route.snapshot.queryParamMap.get('folderId') } });
    } else {
      this.router.navigate(['/load'], { queryParams: { view: 'archive', analysisTrackId: this.trackId } });
    }
  }

  private loadEntitlements(): void {
    this.authService.getEntitlements().subscribe({
      next: limits => this.entitlements = limits,
      error: () => this.entitlements = null
    });
  }

  private parseGpx(gpx: string): AnalyzerPoint[] {
    const xml = new DOMParser().parseFromString(gpx, 'application/xml');
    const elements = (root: Document | Element, name: string): Element[] =>
      Array.from(root.getElementsByTagNameNS('*', name));
    let groups = elements(xml, 'trkseg');
    let pointName = 'trkpt';
    if (!groups.length) {
      groups = elements(xml, 'trk');
      if (!groups.length) { groups = elements(xml, 'rte'); pointName = 'rtept'; }
    }
    if (!groups.length) groups = [xml.documentElement];
    const points: AnalyzerPoint[] = [];
    let distanceKm = 0;
    let segment = 0;
    for (const group of groups) {
      let previous: AnalyzerPoint | null = null;
      for (const node of elements(group, pointName)) {
        const lat = Number(node.getAttribute('lat') ?? NaN);
        const lon = Number(node.getAttribute('lon') ?? NaN);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          previous = null;
          segment++;
          continue;
        }
        const text = elements(node, 'ele')[0]?.textContent?.trim();
        const ele = text ? Number(text.replace(',', '.')) : Number.NaN;
        const point = { lat, lon, ele, distanceKm, segment };
        if (previous) distanceKm += this.distanceMeters(previous, point) / 1000;
        point.distanceKm = distanceKm;
        points.push(point);
        previous = point;
      }
      segment++;
    }
    return points;
  }

  private buildLocalReport(language: AppLanguage): RouteAnalysisReport {
    const stats = this.stats;
    const t = (key: ReportTextKey) => this.localReportText(key, language);
    const hardClimbs = this.findClimbHighlights(language);
    const gain = stats?.elevationGain;
    const routeType = gain == null ? 'sin-altimetria' : gain > 1200 ? 'subida_dura' : gain > 700 ? 'exigente' : 'mixta';
    return {
      summary: stats
        ? `${t('localRouteOf')} ${stats.distanceKm.toFixed(1)} km. ${gain == null ? t('localNoGain') : `${t('localWithGain')} ${gain} m ${t('localPositiveGain')}${this.elevationResult?.status === 'partial' ? ` ${t('localPartialGain')}` : ''}.`}`
        : t('localGpxReady'),
      routeType,
      difficultyExplanation: stats && gain != null
        ? `${t('localDifficultyPrefix')} ${gain} m ${t('localGainAcross')} ${stats.distanceKm.toFixed(1)} km.`
        : t('localDifficultyUnavailable'),
      highlights: hardClimbs,
      warnings: [
        ...(gain != null && gain > 900 ? [t('localPaceClimbs')] : []),
        ...(this.elevationResult?.status === 'partial' ? [t('elevationPartial')] : this.elevationResult?.status === 'unavailable' ? [t('elevationUnavailable')] : [])
      ],
      recommendations: [
        t('localNumberedPoints'),
        t('localReviewProfile')
      ],
      sectors: this.buildLocalSectors(language),
      approaches: this.buildLocalApproaches(language)
    };
  }

  private findClimbHighlights(language: AppLanguage): RouteAnalysisHighlight[] {
    const points = this.elevationResult?.profile ?? [];
    if (!points.length) return [];
    const highlights: RouteAnalysisHighlight[] = [];
    const windowKm = 1.5;
    for (let start = 0; start < points.length; start += 25) {
      const startPoint = points[start];
      const end = points.findIndex(point => point.segment === startPoint.segment && point.distanceKm >= startPoint.distanceKm + windowKm);
      if (end <= start) continue;
      const endPoint = points[end];
      const gain = endPoint.ele - startPoint.ele;
      const slope = (gain / (windowKm * 1000)) * 100;
      if (gain > 90 && slope > 5) {
        highlights.push({
          title: this.localReportText('localClimbTitle', language),
          description: `${windowKm.toFixed(1)} km ${this.localReportText('localClimbSection', language)} ${slope.toFixed(1)}%.`,
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
    const points = this.elevationResult?.profile ?? [];
    this.profileTicks = [];
    if (!points.length) {
      this.profilePath = '';
      return;
    }
    const width = 760;
    const height = 160;
    const maxDistance = this.elevationResult?.distanceKm || 1;
    const minEle = this.elevationResult?.min ?? 0;
    const maxEle = this.elevationResult?.max ?? minEle;
    const range = Math.max(1, maxEle - minEle);
    const profile = points.filter((point, index) => index % Math.max(1, Math.ceil(points.length / 350)) === 0
        || points[index - 1]?.segment !== point.segment || points[index + 1]?.segment !== point.segment)
      .map(point => ({
        x: (point.distanceKm / maxDistance) * width,
        y: height - ((point.ele - minEle) / range) * height,
        segment: point.segment
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
    this.profileMarkers = this.profilePath ? reportHighlights.map(highlight => {
      const point = this.findPointForHighlight(highlight);
      return {
        ...highlight,
        ...this.projectProfilePoint(point, 760, 160)
      };
    }) : [];
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
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const point of this.points) {
      minLat = Math.min(minLat, point.lat);
      maxLat = Math.max(maxLat, point.lat);
      minLon = Math.min(minLon, point.lon);
      maxLon = Math.max(maxLon, point.lon);
    }
    const padding = 22;
    return { points: [], minLat, maxLat, minLon, maxLon, width, height, padding };
  }

  private projectPoint(point: AnalyzerPoint, projection: TrackProjection): SvgPoint {
    const latRange = Math.max(0.000001, projection.maxLat - projection.minLat);
    const lonRange = Math.max(0.000001, projection.maxLon - projection.minLon);
    return {
      x: projection.padding + ((point.lon - projection.minLon) / lonRange) * (projection.width - projection.padding * 2),
      y: projection.padding + ((projection.maxLat - point.lat) / latRange) * (projection.height - projection.padding * 2),
      segment: point.segment
    };
  }

  private projectProfilePoint(point: AnalyzerPoint, width: number, height: number): SvgPoint {
    const maxDistance = this.elevationResult?.distanceKm || 1;
    const profile = this.elevationResult?.profile ?? [];
    const nearest = profile.reduce((best, current) => Math.abs(current.distanceKm - point.distanceKm) < Math.abs(best.distanceKm - point.distanceKm) ? current : best, profile[0]);
    const minEle = this.elevationResult?.min ?? 0;
    const maxEle = this.elevationResult?.max ?? minEle;
    const range = Math.max(1, maxEle - minEle);
    return {
      x: (point.distanceKm / maxDistance) * width,
      y: height - (((nearest?.ele ?? minEle) - minEle) / range) * height
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
    return points.map((point, index) => `${index === 0 || point.segment !== points[index - 1].segment ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
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

  private buildLocalSectors(language: AppLanguage) {
    if (!this.stats) return [];
    const third = this.stats.distanceKm / 3;
    return [
      {
        name: this.localReportText('localOpening', language),
        kmStart: 0,
        kmEnd: third,
        focus: this.localReportText('localOpeningFocus', language),
        effort: 'medio' as const
      },
      {
        name: this.localReportText('localMiddle', language),
        kmStart: third,
        kmEnd: third * 2,
        focus: this.localReportText('localMiddleFocus', language),
        effort: (this.stats.elevationGain ?? 0) > 700 ? 'alto' as const : 'medio' as const
      },
      {
        name: this.localReportText('localFinish', language),
        kmStart: third * 2,
        kmEnd: this.stats.distanceKm,
        focus: this.localReportText('localFinishFocus', language),
        effort: 'medio' as const
      }
    ];
  }

  private buildLocalApproaches(language: AppLanguage) {
    return {
      recreational: [
        this.localReportText('localRecreationOne', language),
        this.localReportText('localRecreationTwo', language)
      ],
      training: [
        this.localReportText('localTrainingOne', language),
        this.localReportText('localTrainingTwo', language)
      ],
      competition: [
        this.localReportText('localCompetitionOne', language),
        this.localReportText('localCompetitionTwo', language)
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
