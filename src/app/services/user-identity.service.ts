import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UserIdentityService {
  private readonly storageKey = 'gpxUserId';
  private cachedId: string | null = null;

  getUserId(): string {
    if (this.cachedId) return this.cachedId;

    const stored = this.readPersistedId();
    if (stored) {
      this.cachedId = stored;
      return stored;
    }

    const generated = `user-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    this.cachedId = generated;
    this.persistId(generated);
    return generated;
  }

  private readPersistedId(): string | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      return localStorage.getItem(this.storageKey);
    } catch {
      return null;
    }
  }

  private persistId(id: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey, id);
    } catch {
      // Ignore persistence errors to avoid breaking the flow.
    }
  }
}
