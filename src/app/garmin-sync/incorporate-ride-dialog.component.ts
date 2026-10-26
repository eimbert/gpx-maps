import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LanguageService } from '../services/language.service';
import { garminTranslations, GarminTextKey } from './garmin-translations';

export interface IncorporateRideChoice { name: string; shared: boolean; }

@Component({
  selector: 'app-incorporate-ride-dialog',
  template: `
    <h2 mat-dialog-title>{{ t('incorporateTitle') }}</h2>
    <form (ngSubmit)="confirm()">
      <mat-dialog-content>
        <p>{{ t('incorporateHint') }}</p>
        <label for="inbox-route-name">{{ t('routeName') }}</label>
        <input id="inbox-route-name" name="routeName" type="text" [(ngModel)]="name" maxlength="255" required autocomplete="off" cdkFocusInitial />
        <mat-checkbox class="share-route" name="shared" [(ngModel)]="shared">{{ t('shareCommunity') }}</mat-checkbox>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="dialog.close()">{{ t('cancel') }}</button>
        <button mat-flat-button color="primary" type="submit" [disabled]="!name.trim()">{{ t('incorporate') }}</button>
      </mat-dialog-actions>
    </form>`,
  styles: [`
    :host { display:block; color:var(--ui-text); }
    h2 { font-size:24px; font-weight:800; }
    p { color:var(--ui-muted); line-height:1.5; }
    label { display:block; margin:16px 0 8px; font-weight:700; }
    input[type=text] { display:block; width:100%; min-height:50px; box-sizing:border-box; border:1px solid var(--ui-border); border-radius:9px; padding:13px; font:inherit; font-size:16px; color:var(--ui-text); background:var(--ui-page); appearance:none; }
    input[type=text]:focus { outline:none; border-color:var(--ui-accent); box-shadow:inset 0 0 0 1px var(--ui-accent); }
    .share-route { display:block; margin-top:18px; font-size:14px; }
    mat-dialog-actions { gap:8px; padding-top:20px; }
  `]
})
export class IncorporateRideDialogComponent {
  name: string;
  shared = true;
  constructor(public dialog: MatDialogRef<IncorporateRideDialogComponent, IncorporateRideChoice>,
    @Inject(MAT_DIALOG_DATA) data: { name: string }, private language: LanguageService) {
    this.name = data.name;
  }
  t(key: GarminTextKey): string { return garminTranslations[this.language.current][key]; }
  confirm(): void { if (this.name.trim()) this.dialog.close({ name: this.name.trim(), shared: this.shared }); }
}
