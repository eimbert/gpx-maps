import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { PublicRouteAnalysis, RouteAnalysis, RouteAnalysisRequest, RouteAnalysisStats } from '../interfaces/route-analysis';
import { selectedUiText } from './screen-texts';

export function matchesAnalysisRoute(analysis: RouteAnalysis, trackId: number, source: 'tracks' | 'plan'): boolean {
  return analysis.trackId === trackId && analysis.source === source;
}

@Injectable({ providedIn: 'root' })
export class RouteAnalysisService {
  private readonly apiBase = environment.routeAnalysisApiBase;

  constructor(private http: HttpClient) {}

  analyzeRoute(payload: RouteAnalysisRequest): Observable<RouteAnalysis> {
    console.info('[RouteAnalysisService] POST', this.apiBase);
    return this.http.post<RouteAnalysis>(this.apiBase, payload).pipe(
      map(analysis => {
        const normalized = this.normalizeAnalysis(analysis);
        if (payload.trackId && payload.source && payload.source !== 'upload'
          && !matchesAnalysisRoute(normalized, payload.trackId, payload.source)) {
          throw new Error(selectedUiText('analysisScopeMismatch'));
        }
        return normalized;
      })
    );
  }

  calculateElevation(payload: RouteAnalysisRequest): Observable<RouteAnalysisStats | null> {
    return this.http.post<RouteAnalysisStats>(`${this.apiBase}/elevation`, payload).pipe(
      map(stats => this.normalizeRouteStats(stats))
    );
  }

  getTrackAnalysis(trackId: number, source: 'tracks' | 'plan' = 'tracks'): Observable<RouteAnalysis | null> {
    console.info('[RouteAnalysisService] GET', `${this.apiBase}/track/${trackId}`);
    return this.http.get<RouteAnalysis | null>(`${this.apiBase}/track/${trackId}`, { params: { source } }).pipe(
      map(analysis => {
        if (!analysis) return null;
        const normalized = this.normalizeAnalysis(analysis);
        // Legacy scoped endpoints omit source; the request supplies it. Explicit conflicts are rejected.
        normalized.source = normalized.source ?? source;
        return matchesAnalysisRoute(normalized, trackId, source) ? normalized : null;
      })
    );
  }

  lookupExisting(payload: RouteAnalysisRequest): Observable<RouteAnalysis | null> {
    return this.http.post<RouteAnalysis>(`${this.apiBase}/lookup`, payload).pipe(
      map(analysis => {
        if (!analysis) return null;
        const normalized = this.normalizeAnalysis(analysis);
        if (payload.trackId && payload.source && payload.source !== 'upload'
          && !matchesAnalysisRoute(normalized, payload.trackId, payload.source)) return null;
        return normalized;
      })
    );
  }

  refreshAnalysis(analysisId: number): Observable<RouteAnalysis> {
    return this.http.post<RouteAnalysis>(`${this.apiBase}/${analysisId}/refresh`, {}).pipe(
      map(analysis => this.normalizeAnalysis(analysis))
    );
  }

  getPublicAnalyses(): Observable<PublicRouteAnalysis[]> {
    return this.http.get<unknown>(`${this.apiBase}/public`).pipe(
      map(response => this.normalizePublicList(response))
    );
  }

  getRecentPublicAnalyses(limit = 6): Observable<PublicRouteAnalysis[]> {
    return this.http.get<unknown>(`${this.apiBase}/public/recent`, { params: { limit } }).pipe(
      map(response => this.normalizePublicList(response))
    );
  }

  private normalizePublicList(response: unknown): PublicRouteAnalysis[] {
    const body: any = response ?? [];
    const list = Array.isArray(body) ? body : body.content ?? body.items ?? body.analyses ?? [];
    return (Array.isArray(list) ? list : []).map((item: any) => ({
      ...this.normalizeAnalysis(item),
      title: String(item.title ?? item.routeName ?? item.route_name ?? 'Ruta analizada'),
      fileName: item.fileName ?? item.file_name ?? null
    }));
  }

  private normalizeAnalysis(analysis: RouteAnalysis): RouteAnalysis {
    const report: any = analysis.report ?? (analysis as any).analysisJson ?? (analysis as any).analysis_json ?? {};
    return {
      ...analysis,
      id: this.toNullableNumber(analysis.id),
      trackId: this.toNullableNumber(analysis.trackId ?? (analysis as any).track_id),
      folderId: this.toNullableNumber(analysis.folderId ?? (analysis as any).folder_id),
      userId: this.toNullableNumber(analysis.userId ?? (analysis as any).user_id),
      gpxHash: analysis.gpxHash ?? (analysis as any).gpx_hash ?? null,
      analysisVersion: analysis.analysisVersion ?? (analysis as any).analysis_version ?? null,
      fallbackReason: analysis.fallbackReason ?? (analysis as any).fallback_reason ?? null,
      userInstructions: analysis.userInstructions ?? (analysis as any).user_instructions ?? null,
      elevationSource: analysis.elevationSource ?? (analysis as any).elevation_source ?? null,
      routeStats: this.normalizeRouteStats(analysis.routeStats ?? (analysis as any).route_stats),
      createdAt: analysis.createdAt ?? (analysis as any).created_at ?? null,
      updatedAt: analysis.updatedAt ?? (analysis as any).updated_at ?? null,
      title: analysis.title ?? (analysis as any).routeTitle ?? (analysis as any).route_title ?? null,
      fileName: analysis.fileName ?? (analysis as any).file_name ?? null,
      reportLanguage: analysis.reportLanguage ?? (analysis as any).report_language ?? null,
      usageCharged: Boolean(analysis.usageCharged ?? (analysis as any).usage_charged),
      reusedExisting: Boolean(analysis.reusedExisting ?? (analysis as any).reused_existing),
      report: {
        summary: String(report.summary ?? ''),
        routeType: report.routeType ?? report.route_type ?? 'mixta',
        difficultyExplanation: String(report.difficultyExplanation ?? report.difficulty_explanation ?? ''),
        highlights: Array.isArray(report.highlights) ? report.highlights : [],
        warnings: Array.isArray(report.warnings) ? report.warnings : [],
        recommendations: Array.isArray(report.recommendations) ? report.recommendations : [],
        sectors: Array.isArray(report.sectors) ? report.sectors : [],
        approaches: report.approaches ?? {}
      }
    };
  }

  private normalizeRouteStats(value: any): RouteAnalysisStats | null {
    if (!value) return null;
    const profile = value.elevationProfile ?? value.elevation_profile ?? [];
    return {
      distanceKm: Number(value.distanceKm ?? value.distance_km),
      elevationGainM: this.toNullableNumber(value.elevationGainM ?? value.elevation_gain_m),
      elevationLossM: this.toNullableNumber(value.elevationLossM ?? value.elevation_loss_m),
      minEleM: this.toNullableNumber(value.minEleM ?? value.min_ele_m),
      maxEleM: this.toNullableNumber(value.maxEleM ?? value.max_ele_m),
      elevationQuality: value.elevationQuality ?? null,
      elevationStatus: value.elevationStatus ?? value.elevation_status ?? null,
      elevationVersion: this.toNullableNumber(value.elevationVersion ?? value.elevation_version ?? value.elevationAlgorithmVersion ?? value.elevation_algorithm_version),
      elevationProfile: Array.isArray(profile) ? profile.map((point: any) => ({
        distanceKm: Number(point.distanceKm ?? point.distance_km),
        elevationM: this.toNullableNumber(point.elevationM ?? point.elevation_m)
      })).filter((point: any) => Number.isFinite(point.distanceKm)) : []
    };
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
