import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export type AnimationGate = { kind: 'guest' | 'cooldown' | 'error'; daysRemaining?: number };

interface AnimationAccessResponse {
  allowed: boolean;
  nextAvailableAt: string | null;
  daysRemaining: number;
  plan: 'FREE' | 'PREMIUM' | 'ADMIN';
}

@Injectable({ providedIn: 'root' })
export class AnimationAccessService {
  private cached: { userId: number; status: AnimationAccessResponse } | null = null;
  private readonly url = `${environment.accountApiBase}/animations`;

  constructor(private auth: AuthService, private http: HttpClient) {}

  async refreshAvailability(): Promise<void> {
    this.cached = null;
    const session = this.auth.getSession();
    if (!session?.verified || !this.auth.isAuthenticated()) return;
    try {
      const status = await firstValueFrom(this.http.get<AnimationAccessResponse>(this.url));
      if (!this.cached && this.auth.getSession()?.id === session.id) this.cached = { userId: session.id, status };
    } catch {
      // The claim at halfway remains authoritative if this early check fails.
    }
  }

  getKnownCooldown(): AnimationGate | null {
    const session = this.auth.getSession();
    if (!session?.verified || !this.auth.isAuthenticated() || this.cached?.userId !== session.id) return null;
    const status = this.cached.status;
    if (status.allowed || !status.nextAvailableAt) return null;
    const remaining = new Date(status.nextAvailableAt).getTime() - Date.now();
    return remaining > 0 ? { kind: 'cooldown', daysRemaining: Math.ceil(remaining / 86400000) } : null;
  }

  async claimFullPlayback(): Promise<AnimationGate | null> {
    const session = this.auth.getSession();
    if (!session?.verified || !this.auth.isAuthenticated()) return { kind: 'guest' };
    try {
      const status = await firstValueFrom(this.http.post<AnimationAccessResponse>(`${this.url}/claim`, {}));
      this.cached = { userId: session.id, status };
      return status.allowed ? null : { kind: 'cooldown', daysRemaining: Math.max(1, status.daysRemaining) };
    } catch (error) {
      return error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)
        ? { kind: 'guest' }
        : { kind: 'error' };
    }
  }
}
