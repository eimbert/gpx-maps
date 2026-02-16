import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MapPayloadTransferService {
  private payload: unknown | null = null;

  set(payload: unknown): void {
    this.payload = payload;
  }

  get<T>(): T | null {
    return this.payload as T | null;
  }

  clear(): void {
    this.payload = null;
  }
}
