import { Component } from '@angular/core';
import { APP_LANGUAGES, AppLanguage, LanguageService } from '../services/language.service';

@Component({
  selector: 'app-language-selector',
  template: `<button type="button" class="language-selector" [matMenuTriggerFor]="languageMenu"
    [matTooltip]="'language' | uiText" [attr.aria-label]="'language' | uiText">
    <mat-icon aria-hidden="true">language</mat-icon>
  </button>
  <mat-menu #languageMenu="matMenu" xPosition="before">
    <button mat-menu-item *ngFor="let option of languages" (click)="select(option.code)"
      [attr.aria-current]="language.current === option.code ? 'true' : null">
      <mat-icon class="language-check" [class.language-check-hidden]="language.current !== option.code" aria-hidden="true">check</mat-icon>
      <span [attr.lang]="option.code">{{ option.name }}</span>
    </button>
  </mat-menu>`,
  styles: [`:host { display: inline-flex; }
    .language-selector { display: grid; place-items: center; box-sizing: border-box; width: 38px; height: 38px; padding: 0; border: 1px solid #3a4539; border-radius: 12px; background: #222c24; color: #eff3e9; cursor: pointer; }
    .language-selector mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .language-selector:hover { background: #2a342b; }
    .language-selector:focus-visible { outline: 2px solid #edcf3d; outline-offset: 2px; }
    .language-check { color: #edcf3d; }
    .language-check-hidden { visibility: hidden; }`]
})
export class LanguageSelectorComponent {
  readonly languages = APP_LANGUAGES;
  constructor(public language: LanguageService) {}

  select(value: AppLanguage): void {
    if (value === this.language.current) return;
    this.language.setLanguage(value);
    // Date/number pipes receive LOCALE_ID at bootstrap.
    window.location.reload();
  }
}
