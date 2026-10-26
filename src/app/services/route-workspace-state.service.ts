import { Injectable } from '@angular/core';

/** Session-only UI state, scoped to the signed-in user. Never persists GPX data to disk. */
@Injectable({ providedIn: 'root' })
export class RouteWorkspaceStateService {
  private owner: number | null = null;
  private value: unknown;

  save<T>(owner: number | null, value: T): void {
    this.owner = owner;
    this.value = value;
  }

  read<T>(owner: number | null): T | undefined {
    if (owner !== this.owner) this.clear();
    return this.value as T | undefined;
  }

  clear(): void {
    this.owner = null;
    this.value = undefined;
  }
}
