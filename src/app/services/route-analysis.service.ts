import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { PublicRouteAnalysis, RouteAnalysis, RouteAnalysisRequest, RouteAnalysisStats } from '../interfaces/route-analysis';

@Injectable({ providedIn: 'root' })
export class RouteAnalysisService {
  private readonly apiBase = environment.routeAnalysisApiBase;

  constructor(private http: HttpClient) {}

  analyzeRoute(payload: RouteAnalysisRequest): Observable<RouteAnalysis> {
    console.info('[RouteAnalysisService] POST', this.apiBase);
    return this.http.post<RouteAnalysis>(this.apiBase, payload).pipe(
      map(analysis => this.normalizeAnalysis(analysis))
    );
  }

  calculateElevation(payload: RouteAnalysisRequest): Observable<RouteAnalysisStats | null> {
    return this.http.post<RouteAnalysisStats>(`${this.apiBase}/elevation`, payload).pipe(
      map(stats => this.normalizeRouteStats(stats))
    );
  }

  getTrackAnalysis(trackId: number): Observable<RouteAnalysis | null> {
    console.info('[RouteAnalysisService] GET', `${this.apiBase}/track/${trackId}`);
    return this.http.get<RouteAnalysis | null>(`${this.apiBase}/track/${trackId}`).pipe(
      map(analysis => analysis ? this.normalizeAnalysis(analysis) : null)
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
      elevationGainM: Number(value.elevationGainM ?? value.elevation_gain_m),
      elevationLossM: Number(value.elevationLossM ?? value.elevation_loss_m),
      minEleM: Number(value.minEleM ?? value.min_ele_m),
      maxEleM: Number(value.maxEleM ?? value.max_ele_m),
      elevationProfile: Array.isArray(profile) ? profile.map((point: any) => ({
        distanceKm: Number(point.distanceKm ?? point.distance_km),
        elevationM: Number(point.elevationM ?? point.elevation_m)
      })).filter((point: any) => Number.isFinite(point.distanceKm) && Number.isFinite(point.elevationM)) : []
    };
  }

  private toNullableNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
