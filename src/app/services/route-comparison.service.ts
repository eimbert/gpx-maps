import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { RouteComparison, SavedRouteComparison } from '../interfaces/route-comparison';

@Injectable({ providedIn: 'root' })
export class RouteComparisonService {
  constructor(private http: HttpClient) {}
  compare(trackIds: number[], reportLanguage: string) {
    return this.http.post<RouteComparison>(`${environment.routeAnalysisApiBase}/comparison`, { trackIds, reportLanguage })
      .pipe(timeout(125000));
  }
  list(folderId: number) {
    return this.http.get<SavedRouteComparison[]>(`${environment.routeAnalysisApiBase}/comparison/folder/${folderId}`);
  }
  get(reportId: number) {
    return this.http.get<RouteComparison>(`${environment.routeAnalysisApiBase}/comparison/${reportId}`);
  }
}
