import { Component, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatDialogRef } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { takeUntil, timeout } from 'rxjs/operators';
import { parseProximityCoordinates, ProximityOrigin } from '../utils/proximity-origin';
import { selectedUiText } from '../services/screen-texts';
import { resolveLanguage } from '../services/language.service';

export type ProximityOriginChoice = ProximityOrigin | 'current';

@Component({
  selector: 'app-proximity-origin-dialog',
  templateUrl: './proximity-origin-dialog.component.html',
  styleUrls: ['./proximity-origin-dialog.component.css']
})
export class ProximityOriginDialogComponent implements OnDestroy {
  mode: 'current' | 'place' | 'coordinates' = 'current';
  query = '';
  coordinates = '';
  loading = false;
  error = '';
  results: ProximityOrigin[] = [];
  private readonly destroy$ = new Subject<void>();

  constructor(private http: HttpClient, public dialogRef: MatDialogRef<ProximityOriginDialogComponent, ProximityOriginChoice>) {}

  submit(): void {
    this.error = '';
    if (this.mode === 'current') { this.dialogRef.close('current'); return; }
    if (this.mode === 'coordinates') {
      const origin = parseProximityCoordinates(this.coordinates);
      if (origin) this.dialogRef.close(origin);
      else this.error = selectedUiText('coordinateInputError');
      return;
    }
    if (this.loading) return;
    if (this.query.trim().length < 2) { this.error = selectedUiText('populationInputError'); return; }
    this.loading = true;
    this.results = [];
    this.http.get<Array<{ lat: string; lon: string; display_name: string }>>('https://nominatim.openstreetmap.org/search', {
      params: { q: this.query.trim(), format: 'jsonv2', limit: '5', 'accept-language': resolveLanguage(document.documentElement.lang) }
    }).pipe(timeout(12000), takeUntil(this.destroy$)).subscribe({
      next: places => {
        this.loading = false;
        this.results = places.map(place => ({ lat: Number(place.lat), lon: Number(place.lon), label: place.display_name }))
          .filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lon) && Math.abs(place.lat) <= 90 && Math.abs(place.lon) <= 180);
        if (!this.results.length) this.error = selectedUiText('populationNotFound');
      },
      error: () => { this.loading = false; this.error = selectedUiText('populationSearchFailed'); }
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
