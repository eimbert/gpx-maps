import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type AppLanguage = 'en' | 'es' | 'ca' | 'gl' | 'eu';

export const APP_LANGUAGES: ReadonlyArray<{ code: AppLanguage; label: string; name: string }> = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'es', label: 'SP', name: 'Español' },
  { code: 'ca', label: 'CA', name: 'Català' },
  { code: 'gl', label: 'GL', name: 'Galego' },
  { code: 'eu', label: 'EU', name: 'Euskara' }
];

const STORAGE_KEY = 'tracketeo.language';

export function resolveLanguage(value: string | null | undefined): AppLanguage {
  const code = value?.trim().toLowerCase().split(/[-_]/)[0];
  return APP_LANGUAGES.some(language => language.code === code) ? code as AppLanguage : 'en';
}

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly languageSubject = new BehaviorSubject<AppLanguage>(this.initialLanguage());
  readonly language$ = this.languageSubject.asObservable();

  constructor() {
    this.updateDocumentLanguage(this.current);
  }

  get current(): AppLanguage {
    return this.languageSubject.value;
  }

  setLanguage(language: AppLanguage): void {
    if (!APP_LANGUAGES.some(option => option.code === language)) return;
    this.updateDocumentLanguage(language);
    this.languageSubject.next(language);
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // The selection still works when the browser blocks local storage.
    }
  }

  private initialLanguage(): AppLanguage {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && APP_LANGUAGES.some(option => option.code === saved)) return saved as AppLanguage;
    } catch {
      // Use the device language when storage is unavailable.
    }
    return resolveLanguage(typeof navigator === 'undefined' ? undefined : navigator.language);
  }

  private updateDocumentLanguage(language: AppLanguage): void {
    if (typeof document !== 'undefined') document.documentElement.lang = language;
  }
}
