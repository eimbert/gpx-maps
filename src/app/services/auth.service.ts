import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { LoginResponse, RegisterResponse } from '../interfaces/auth';
import { environment } from '../../environments/environment';
import { LoginSuccessResponse } from '../interfaces/auth';

interface UserInfoResponse {
  userId?: number;
  nom?: string;
  nickname?: string;
  rol?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'gpxAuthSession';
  private cachedSession: LoginSuccessResponse | null = null;

  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(environment.loginUrl, { email, password });
  }

  register(email: string, password: string, name: string, nickname: string): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(environment.registerUrl, {
      email,
      password,
      name,
      nickname
    });
  }

  saveSession(session: LoginSuccessResponse): void {
    this.cachedSession = session;
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(session));
    } catch {
      // Silently ignore persistence errors.
    }
  }

  getSession(): LoginSuccessResponse | null {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(this.storageKey);

        if (!stored) {
          this.cachedSession = null;
          return null;
        }

        this.cachedSession = JSON.parse(stored) as LoginSuccessResponse;
      } catch {
        this.cachedSession = null;
        return null;
      }
    }

    return this.cachedSession;
  }

  clearSession(): void {
    this.cachedSession = null;
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Ignore persistence issues.
    }
  }

  isAuthenticated(): boolean {
    const session = this.getSession();
    if (!session) return false;

    const isValid = this.isTokenValid(session.token);
    if (!isValid) {
      this.clearSession();
    }

    return isValid;
  }

  validateSessionWithBackend(): Observable<LoginSuccessResponse | null> {
    const session = this.getSession();
    if (!session || !this.isTokenValid(session.token)) {
      this.clearSession();
      return of(null);
    }

    const headers = new HttpHeaders({ Authorization: `Bearer ${session.token}` });

    return this.http.get<UserInfoResponse>(environment.meUrl, { headers }).pipe(
      map(userInfo => {
        const updatedSession: LoginSuccessResponse = {
          ...session,
          id: userInfo.userId ?? session.id,
          name: userInfo.nom ?? session.name,
          nickname: userInfo.nickname ?? session.nickname,
          rol: userInfo.rol ?? session.rol
        };

        this.saveSession(updatedSession);
        return updatedSession;
      }),
      catchError(() => {
        this.clearSession();
        return of(null);
      })
    );
  }

  private isTokenValid(token: string): boolean {
    const payload = this.decodeTokenPayload(token);
    if (!payload || typeof payload.exp !== 'number') {
      return false;
    }

    const expirationDate = payload.exp * 1000;
    return Date.now() < expirationDate;
  }

  private decodeTokenPayload(token: string): { exp?: number } | null {
    const [, payload] = token.split('.');
    if (!payload) return null;

    try {
      const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
      const paddedPayload = normalizedPayload.padEnd(normalizedPayload.length + (4 - (normalizedPayload.length % 4)) % 4, '=');
      const decodedPayload = atob(paddedPayload);
      return JSON.parse(decodedPayload) as { exp?: number };
    } catch {
      return null;
    }
  }
}
