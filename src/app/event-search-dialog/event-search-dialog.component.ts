import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { RaceEvent } from '../interfaces/events';

export interface EventSearchDialogData {
  events: RaceEvent[];
  selectedEventId: number | null;
  selectedModalityId: number | null;
}

export interface EventSearchDialogResult {
  eventId: number;
  modalityId?: number;
}

interface EventSearchRow {
  eventId: number;
  name: string;
  year: number;
  population: string | null | undefined;
  autonomousCommunity: string | null | undefined;
  distancesKm: number[];
  logo?: string | null;
  mime?: string | null;   
  distanceKm?: number | null;

}

@Component({
  selector: 'app-event-search-dialog',
  templateUrl: './event-search-dialog.component.html',
  styleUrls: ['./event-search-dialog.component.css']
})
export class EventSearchDialogComponent {
  rows: EventSearchRow[] = [];
  private readonly placeholderLogo = 'assets/no-image.svg';

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: EventSearchDialogData,
    private dialogRef: MatDialogRef<EventSearchDialogComponent, EventSearchDialogResult>
  ) {
    console.clear()
    console.log(data)
    this.rows = this.buildRows(data.events);
  }

  getLogo(row: EventSearchRow): string {
    
    return row.logo ? `data:${row.mime};base64,${row.logo}` : this.placeholderLogo;
  }

  isSelected(row: EventSearchRow): boolean {
    return row.eventId === this.data.selectedEventId;
  }

  onRowDoubleClick(row: EventSearchRow): void {
    this.dialogRef.close({ eventId: row.eventId });
  }

  getDistancesLabel(row: EventSearchRow): string {
    return row.distanceKm ? row.distanceKm + " km": ""
    //row.distancesKm.map(distance => `${distance.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`).join(' · ');
  }

  private buildRows(events: RaceEvent[]): EventSearchRow[] {
    return events.map(event => ({
      eventId: event.id,
      name: event.name,
      year: event.year,
      population: event.population,
      autonomousCommunity: event.autonomousCommunity,
      distancesKm: event.modalities.map(modality => modality.distanceKm),
      logo: event.logoBlob,
      mime: event.logoMime,
      distanceKm: event.distanceKm
    }));
  }
}
