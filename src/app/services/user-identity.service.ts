import { Injectable } from '@angular/core';
import { LoginSuccessResponse } from '../interfaces/auth';

@Injectable({ providedIn: 'root' })
export class UserIdentityService {
  private readonly sessionKey = 'gpxAuthSession';

  getUserId(): number {
    const session = this.readSession();
    return session?.id ?? 0;
  }

  private readSession(): LoginSuccessResponse | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const stored = localStorage.getItem(this.sessionKey);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as LoginSuccessResponse;
      return typeof parsed?.id === 'number' ? parsed : null;
    } catch {
      return null;
    }
  }
}
