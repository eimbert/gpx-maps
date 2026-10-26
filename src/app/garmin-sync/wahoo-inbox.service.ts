import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface WahooConnectionStatus {
  available: boolean;
  connected: boolean;
  connectedAt: string | null;
  sandbox?: boolean;
}

export interface WahooRideStatus {
  id: number;
  trackId: number | null;
  name: string;
  startTime: string | null;
  pointCount: number;
  status: 'PENDING' | 'INCORPORATED';
  distanceKm: number | null;
  ascentMeters: number | null;
  durationSeconds: number | null;
  province?: string | null;
  population?: string | null;
}

export interface WahooSyncResult {
  imported: number;
  alreadyPresent: number;
  withoutGps: number;
}

@Injectable({ providedIn: 'root' })
export class WahooInboxService {
  private readonly api = environment.tracksApiBase.replace(/\/tracks\/?$/, '/wahoo');

  constructor(private http: HttpClient) {}

  connection(): Observable<WahooConnectionStatus> {
    return this.http.get<WahooConnectionStatus>(`${this.api}/connection`);
  }

  authorize(): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.api}/authorize`, {});
  }

  disconnect(): Observable<void> {
    return this.http.delete<void>(`${this.api}/connection`);
  }

  sync(): Observable<WahooSyncResult> {
    return this.http.post<WahooSyncResult>(`${this.api}/sync`, {});
  }

  rides(): Observable<WahooRideStatus[]> {
    return this.http.get<WahooRideStatus[]>(`${this.api}/rides`);
  }

  preview(id: number): Observable<number[][]> {
    return this.http.get<number[][]>(`${this.api}/rides/${id}/preview`);
  }

  incorporate(id: number, name?: string, shared = false): Observable<WahooRideStatus> {
    return this.http.post<WahooRideStatus>(`${this.api}/rides/${id}/incorporate`, { name, shared });
  }

  discard(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/rides/${id}`);
  }
}
