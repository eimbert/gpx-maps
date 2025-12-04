import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { RaceEvent } from '../interfaces/events';

export interface EventSearchDialogData {
  events: RaceEvent[];
  selectedEventId: string | null;
  selectedModalityId: string | null;
}

export interface EventSearchDialogResult {
  eventId: string;
  modalityId?: string;
}

interface EventSearchRow {
  eventId: string;
  modalityId: string;
  name: string;
  year: number;
  population: string;
  autonomousCommunity: string;
  distanceKm: number;
  logo?: string;
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
    this.rows = this.buildRows(data.events);
  }

  getLogo(row: EventSearchRow): string {
    return row.logo || this.placeholderLogo;
  }

  isSelected(row: EventSearchRow): boolean {
    return row.eventId === this.data.selectedEventId && (!!this.data.selectedModalityId ? row.modalityId === this.data.selectedModalityId : true);
  }

  onRowDoubleClick(row: EventSearchRow): void {
    this.dialogRef.close({ eventId: row.eventId, modalityId: row.modalityId });
  }

  private buildRows(events: RaceEvent[]): EventSearchRow[] {
    return events.flatMap(event =>
      event.modalities.map(modality => ({
        eventId: event.id,
        modalityId: modality.id,
        name: event.name,
        year: event.year,
        population: event.population,
        autonomousCommunity: event.autonomousCommunity,
        distanceKm: modality.distanceKm,
        logo: event.logo
      }))
    );
  }
}
