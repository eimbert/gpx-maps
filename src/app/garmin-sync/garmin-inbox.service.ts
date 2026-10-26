import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface GarminDeviceStatus {
  id: number;
  createdAt: string;
  lastSeenAt: string | null;
  totalPoints: number;
}

export interface GarminRideStatus {
  name?: string;
  id: number;
  trackId: number | null;
  rideStart: number;
  pointCount: number;
  lastReceivedAt: string | null;
  inboxStatus: 'PENDING' | 'INCORPORATED';
  distanceKm: number | null;
  ascentMeters: number | null;
  durationSeconds: number | null;
  province?: string | null;
  population?: string | null;
}

@Injectable({ providedIn: 'root' })
export class GarminInboxService {
  private readonly api = environment.tracksApiBase.replace(/\/tracks\/?$/, '/garmin');

  constructor(private http: HttpClient) {}

  devices(): Observable<GarminDeviceStatus[]> {
    return this.http.get<GarminDeviceStatus[]>(`${this.api}/devices`);
  }

  rides(): Observable<GarminRideStatus[]> {
    return this.http.get<GarminRideStatus[]>(`${this.api}/rides`);
  }

  pair(code: string): Observable<GarminDeviceStatus> {
    return this.http.post<GarminDeviceStatus>(`${this.api}/pair/claim`, { code });
  }

  preview(id: number): Observable<number[][]> {
    return this.http.get<number[][]>(`${this.api}/rides/${id}/preview`);
  }

  incorporate(id: number, name?: string, shared = false): Observable<GarminRideStatus> {
    return this.http.post<GarminRideStatus>(`${this.api}/rides/${id}/incorporate`, { name, shared });
  }

  discard(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/rides/${id}`);
  }
}
