import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { PlanTrack } from '../interfaces/plan';
import { ComparedRoute, EffortDimensions, EffortMetrics, RouteComparison } from '../interfaces/route-comparison';
import { RouteComparisonService } from '../services/route-comparison.service';
import { LanguageService } from '../services/language.service';
import { selectedUiText } from '../services/screen-texts';

@Component({ selector: 'app-route-comparison', templateUrl: './route-comparison.component.html', styleUrls: ['./route-comparison.component.css'] })
export class RouteComparisonComponent implements OnChanges, OnDestroy {
  @ViewChild('pdfReport') pdfReport?: ElementRef<HTMLElement>;
  @Input() tracks: PlanTrack[] = [];
  @Input() savedOnly = false;
  @Input() savedReportId: number | null = null;
  @Output() calculated = new EventEmitter<RouteComparison>();
  report: RouteComparison | null = null;
  loading = false;
  expanded = true;
  exportingPdf = false;
  shareStatus = '';
  error = '';
  private selectionKey = '';
  private sourceXml: string[] = [];
  private request?: Subscription;
  private generation = 0;
  private cachedPdf?: { report: RouteComparison; blob: Blob };
  readonly indicators: { key: keyof EffortMetrics; label: string; unit: string }[] = [
    { key: 'distanceKm', label: selectedUiText('distance'), unit: 'km' },
    { key: 'gainM', label: selectedUiText('gainMetric'), unit: 'm' },
    { key: 'lossM', label: selectedUiText('lossMetric'), unit: 'm' },
    { key: 'minAltitude', label: selectedUiText('minAltitudeMetric'), unit: 'm' },
    { key: 'maxAltitude', label: selectedUiText('maxAltitudeMetric'), unit: 'm' },
    { key: 'uphillAverageGrade', label: selectedUiText('uphillGradeMetric'), unit: '%' },
    { key: 'max100', label: selectedUiText('max100Metric'), unit: '%' },
    { key: 'max250', label: selectedUiText('max250Metric'), unit: '%' },
    { key: 'max500', label: selectedUiText('max500Metric'), unit: '%' },
    { key: 'climbCount', label: selectedUiText('climbCountMetric'), unit: '' },
    { key: 'descentCount', label: selectedUiText('descentCountMetric'), unit: '' },
    { key: 'uphillPercent', label: selectedUiText('uphillMetric'), unit: '%' },
    { key: 'downhillPercent', label: selectedUiText('downhillMetric'), unit: '%' },
    { key: 'flatPercent', label: selectedUiText('flatMetric'), unit: '%' },
    { key: 'punchCount', label: selectedUiText('punchCountMetric'), unit: '' },
    { key: 'punchesPerKm', label: selectedUiText('punchesKmMetric'), unit: '' },
    { key: 'directionChanges', label: selectedUiText('directionChangesMetric'), unit: '' },
    { key: 'sharpGradeChanges', label: selectedUiText('sharpChangesMetric'), unit: '' },
    { key: 'meanRecoveryM', label: selectedUiText('recoveryMetric'), unit: 'm' },
    { key: 'chainedClimbs', label: selectedUiText('chainedClimbsMetric'), unit: '' },
    { key: 'finalThirdGainPercent', label: selectedUiText('finalGainMetric'), unit: '%' },
    { key: 'coveragePercent', label: selectedUiText('coverageMetric'), unit: '%' }
  ];
  readonly dimensions: { key: keyof EffortDimensions; label: string }[] = [
    { key: 'overall', label: selectedUiText('overallEffort') }, { key: 'endurance', label: selectedUiText('enduranceEffort') },
    { key: 'explosiveness', label: selectedUiText('explosiveEffort') }, { key: 'accumulatedFatigue', label: selectedUiText('fatigueEffort') },
    { key: 'regularity', label: selectedUiText('regularityEffort') }, { key: 'finalDemand', label: selectedUiText('finalEffort') }
  ];
  readonly questions = [
    selectedUiText('questionOverall'), selectedUiText('questionPunches'),
    selectedUiText('questionClimbs'), selectedUiText('questionLegs'),
    selectedUiText('questionPace'), selectedUiText('questionRecovery'),
    selectedUiText('questionFatigue'), selectedUiText('questionRider')
  ];
  constructor(private api: RouteComparisonService, private language: LanguageService) {}
  ngOnChanges(changes: SimpleChanges): void {
    if (this.savedOnly) {
      if (changes['savedReportId'] && this.savedReportId !== null) this.openSaved(this.savedReportId);
      return;
    }
    const key = this.tracks.map(t => `${t.folderId}:${t.id}`).join('|');
    if (key === this.selectionKey && this.tracks.every((track, i) => track.routeXml === this.sourceXml[i])) return;
    this.selectionKey = key;
    this.sourceXml = this.tracks.map(track => track.routeXml);
    this.generation++;
    this.request?.unsubscribe();
    this.loading = false; this.report = null; this.error = ''; this.expanded = true; this.shareStatus = '';
  }
  ngOnDestroy(): void { this.generation++; this.request?.unsubscribe(); }
  compare(): void {
    if (this.tracks.length !== 2 || this.loading) return;
    const generation = ++this.generation;
    this.error = ''; this.loading = true;
    this.request = this.api.compare(this.tracks.map(t => t.id), this.language.current).subscribe({
      next: report => {
        if (generation !== this.generation) return;
        this.loading = false; this.report = report; this.expanded = true; this.calculated.emit(report);
      },
      error: error => {
        if (generation !== this.generation) return;
        this.loading = false;
        this.error = error.status === 429 || error.status === 403 || error.status === 402 ? selectedUiText('comparisonLimit')
          : error.status === 401 ? selectedUiText('comparisonSignIn')
          : error.status === 404 ? selectedUiText('comparisonRouteMissing')
          : error.status === 409 ? selectedUiText('comparisonRouteChanged')
          : error.status === 400 ? selectedUiText('comparisonInvalidGpx')
          : selectedUiText('comparisonFailed');
      }
    });
  }
  openSaved(reportId: number): void {
    this.generation++;
    this.request?.unsubscribe();
    const generation=this.generation;
    this.loading=true;this.error='';this.shareStatus='';this.report=null;
    this.request=this.api.get(reportId).subscribe({
      next: report => { if(generation !== this.generation)return;this.loading=false;this.report=report;this.expanded=true; },
      error: error => { if(generation !== this.generation)return;this.loading=false;
        this.error=error.status===404?selectedUiText('comparisonReportMissing'):selectedUiText('comparisonReportFailed'); }
    });
  }

  async downloadPdf(): Promise<void> {
    if(!this.report || this.exportingPdf)return;
    try{const blob=await this.createPdf();this.saveBlob(blob);this.shareStatus=selectedUiText('pdfDownloaded');}
    catch{this.shareStatus=selectedUiText('comparisonPdfFailed');}
  }

  async shareReport(): Promise<void> {
    if (!this.report || this.exportingPdf) return;
    const title = selectedUiText('reportLabel') + ' ' + this.reportTitle;
    const text = `${title}. ${this.report.narrative?.summary || selectedUiText('comparisonDescription')}`;
    try {
      const blob = await this.createPdf();
      const file = new File([blob], this.pdfFileName(), { type: 'application/pdf' });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData & { files?: File[] }) => boolean;
        share?: (data: ShareData & { files?: File[] }) => Promise<void>;
      };
      // Mismo flujo que Analizar ruta: preparar el PDF y compartir el archivo.
      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({ title, text, files: [file] });
        this.shareStatus = selectedUiText('reportShared');
        return;
      }
      if (nav.share) {
        await nav.share({ title, text, url: window.location.href });
        this.shareStatus = selectedUiText('reportLinkShared');
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
      this.shareStatus = selectedUiText('reportCopied');
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
      this.shareStatus = selectedUiText('reportShareFailed');
    }
  }
  get reportTitle(): string {return this.report?.title || (this.report?.routes.map(route=>route.title).join(' vs ') || selectedUiText('comparisonTitle'));}
  private pdfFileName(): string {
    const name=(selectedUiText('reportLabel') + ' '+this.reportTitle).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,110);
    return `${name || 'Informe-rutas'}${this.report?.id ? '-'+this.report.id : ''}.pdf`;
  }
  private saveBlob(blob:Blob):void{
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=this.pdfFileName();document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  private async createPdf():Promise<Blob>{
    if(!this.report)throw new Error('Sin informe');
    if(this.cachedPdf?.report===this.report)return this.cachedPdf.blob;
    const report=this.report;
    this.exportingPdf=true;
    const source=this.pdfReport?.nativeElement;
    if(!source){this.exportingPdf=false;throw new Error('Informe no visible');}
    const article=source.cloneNode(true) as HTMLElement;
    article.removeAttribute('hidden');
    article.style.cssText='display:block;width:900px;max-width:none;box-sizing:border-box;position:fixed;left:0;top:0;z-index:-1;pointer-events:none';
    article.setAttribute('aria-hidden','true');
    article.querySelectorAll('details').forEach(item=>item.open=true);
    article.classList.add('comparison__report--export');
    document.body.appendChild(article);
    try{
      await document.fonts?.ready;
      const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')]);
      const pdf=new jsPDF('p','mm','a4');
      pdf.setProperties({title:selectedUiText('reportLabel') + ' '+this.reportTitle,subject:'Comparación de dificultad de rutas GPX',creator:'Tracketeo'});
      const margin=12,width=pdf.internal.pageSize.getWidth()-margin*2,height=pdf.internal.pageSize.getHeight()-margin*2;
      let y=margin;
      for(const section of Array.from(article.querySelectorAll<HTMLElement>('.comparison__pdf-section'))){
        const canvas=await html2canvas(section,{scale:1.5,backgroundColor:'#ffffff',useCORS:true,logging:false});
        if(!canvas.width || !canvas.height)continue;
        const sectionHeight=canvas.height*width/canvas.width;
        if(sectionHeight<=height){
          if(y>margin && y+sectionHeight>pdf.internal.pageSize.getHeight()-margin){pdf.addPage();y=margin;}
          pdf.addImage(canvas.toDataURL('image/jpeg',.9),'JPEG',margin,y,width,sectionHeight);
          y+=sectionHeight+5;continue;
        }
        if(y>margin){pdf.addPage();y=margin;}
        const pagePixels=Math.floor(height/width*canvas.width);
        for(let top=0;top<canvas.height;top+=pagePixels){
          if(top>0)pdf.addPage();
          const slice=document.createElement('canvas');slice.width=canvas.width;slice.height=Math.min(pagePixels,canvas.height-top);
          const context=slice.getContext('2d');if(!context)throw new Error('No se pudo componer una página');
          context.drawImage(canvas,0,top,canvas.width,slice.height,0,0,canvas.width,slice.height);
          const sliceHeight=slice.height*width/canvas.width;
          pdf.addImage(slice.toDataURL('image/jpeg',.9),'JPEG',margin,margin,width,sliceHeight);
          y=margin+sliceHeight;
        }
        y+=5;
      }
      const blob=pdf.output('blob');
      if(this.report===report)this.cachedPdf={report,blob};
      return blob;
    }finally{
      article.remove();
      this.exportingPdf=false;
    }
  }
  value(value: unknown, unit = ''): string {
    return typeof value === 'number' && Number.isFinite(value)
      ? `${value.toLocaleString(this.language.current, { maximumFractionDigits: 2 })}${unit ? ' ' + unit : ''}` : 'Sin datos';
  }
  score(route: ComparedRoute, key: keyof EffortDimensions): number | null { return route.metrics.dimensions?.[key] ?? null; }
  profilePaths(route: ComparedRoute): string[] {
    const all = this.report?.routes.flatMap(r => r.metrics.profile) ?? [];
    if (!all.length) return [];
    const maxKm = Math.max(...(this.report?.routes.map(r => r.metrics.distanceKm) ?? [1]), 1);
    const min = Math.min(...all.map(p => p.altitude)), max = Math.max(...all.map(p => p.altitude), min + 50);
    const paths: string[] = []; let segment: number | null = null;
    for (const point of route.metrics.profile) {
      const xy = `${(48 + point.km / maxKm * 700).toFixed(1)},${(190 - (point.altitude - min) / (max - min) * 155).toFixed(1)}`;
      if (segment !== point.segment) { paths.push('M' + xy); segment = point.segment; }
      else paths[paths.length - 1] += ' L' + xy;
    }
    return paths;
  }
  profileAltitude(top: boolean): number {
    const values = this.report?.routes.flatMap(r => r.metrics.profile.map(p => p.altitude)) ?? [];
    if (!values.length) return 0;
    const min = Math.min(...values); return top ? Math.max(...values, min + 50) : min;
  }
  get profileDistance(): number { return Math.max(...(this.report?.routes.map(r => r.metrics.distanceKm) ?? [0])); }
}
