import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { LoginResponse, RegisterResponse } from '../interfaces/auth';
import { environment } from '../../environments/environment';
import { LoginSuccessResponse } from '../interfaces/auth';

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
    if (this.cachedSession) return this.cachedSession;
    if (typeof localStorage === 'undefined') return null;
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return null;
      this.cachedSession = JSON.parse(stored) as LoginSuccessResponse;
      return this.cachedSession;
    } catch {
      return null;
    }
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
    return !!this.getSession()?.token;
  }
}
