import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UserIdentityService {
  private readonly storageKey = 'gpxUserId';
  private cachedId: number | null = null;

  getUserId(): number {
    if (this.cachedId) return this.cachedId;

    const stored = this.readPersistedId();
    if (stored) {
      this.cachedId = stored;
      return stored;
    }

    const generated = Date.now();
    this.cachedId = generated;
    this.persistId(generated);
    return generated;
  }

  private readPersistedId(): number | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return null;
      const parsed = Number(stored);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private persistId(id: number): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey, String(id));
    } catch {
      // Ignore persistence errors to avoid breaking the flow.
    }
  }
}
