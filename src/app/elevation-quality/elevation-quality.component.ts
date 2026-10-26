import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InfoMessageService } from '../services/info-message.service';
import { selectedUiText } from '../services/screen-texts';

/** Grade of the original signal, not a certification of sensor type or absolute accuracy. */
@Component({
  selector: 'app-elevation-quality',
  standalone: true,
  imports: [CommonModule],
  template: `<ng-container *ngIf="validQuality">
    <div *ngIf="detailed; else badgeOnly" class="quality-detail">
      <button type="button" [attr.data-quality]="quality" [attr.aria-label]="description"
        [title]="description" (click)="explain($event)">{{ quality }}</button>
      <span class="quality-detail__copy"><strong>{{ detailTitle }}</strong><small>{{ detailSummary }}</small></span>
    </div>
    <ng-template #badgeOnly>
      <button *ngIf="interactive; else label" type="button" [attr.data-quality]="quality"
        [attr.aria-label]="description" [title]="description" (click)="explain($event)">{{ quality }}</button>
      <ng-template #label><span [attr.data-quality]="quality" [title]="description" [attr.aria-label]="description">{{ quality }}</span></ng-template>
    </ng-template>
  </ng-container>`,
  styles: [`:host{display:inline-block;vertical-align:middle;margin-inline-start:6px}
    :host(.quality-detail-host){display:block;margin:0}
    button,span{display:inline-flex;align-items:center;justify-content:center;min-width:25px;min-height:25px;
      box-sizing:border-box;border:1px solid currentColor;border-radius:6px;padding:2px 6px;
      font-family:inherit;font-size:13px;font-weight:700;line-height:1.2;color:#c4dba5;background:#29372c}
    button{cursor:pointer}button:focus-visible{outline:2px solid var(--ui-accent,#edcf3d);outline-offset:3px}
    [data-quality=B]{color:#f1d86d;background:#393624}[data-quality=C]{color:#ffc29e;background:#443029}
    .quality-detail{display:flex;align-items:center;gap:10px;min-width:0}
    .quality-detail button{flex:none;min-width:27px;min-height:27px}
    .quality-detail__copy{display:grid;gap:0;min-width:0;min-height:0;border:0;padding:0;
      background:transparent;color:inherit;justify-content:initial;align-items:initial;font-weight:400}
    .quality-detail__copy strong{font-size:12px;line-height:13px;font-weight:700;color:var(--ui-ink,#263f2c)}
    .quality-detail__copy small{font-size:11px;line-height:12px;font-weight:400;color:var(--ui-paper-muted,#496151)}
    @media(pointer:coarse){button{min-width:32px;min-height:32px}}`]
})
export class ElevationQualityComponent {
  @Input() quality: string | null | undefined;
  @Input() interactive = true;
  @Input() detailed = false;
  constructor(private messages: InfoMessageService) {}
  get validQuality(): boolean { return this.quality === 'A' || this.quality === 'B' || this.quality === 'C'; }
  get detailTitle(): string { return selectedUiText('elevationQualityOriginal'); }
  get detailSummary(): string {
    const key = this.quality === 'A' ? 'elevationQualityBriefA'
      : this.quality === 'B' ? 'elevationQualityBriefB' : 'elevationQualityBriefC';
    return selectedUiText(key);
  }
  get description(): string {
    const key = this.quality === 'A' ? 'elevationQualityA' : this.quality === 'B' ? 'elevationQualityB' : 'elevationQualityC';
    return selectedUiText(key);
  }
  explain(event: Event): void {
    event.stopPropagation();
    this.messages.showMessage({ title: selectedUiText('elevationQualityTitle'),
      message: `${this.description}\n\n${selectedUiText('elevationQualityHint')}` });
  }
}
