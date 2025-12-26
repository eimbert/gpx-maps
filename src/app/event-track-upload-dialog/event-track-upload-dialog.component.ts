import { Component, Inject, OnInit } from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { BikeType, RaceCategory, RaceEvent } from '../interfaces/events';
import { InfoDialogComponent } from '../info-dialog/info-dialog.component';

export interface EventTrackUploadDialogData {
  events: RaceEvent[];
  categories: RaceCategory[];
  bikeTypes: BikeType[];
  defaultEventId: number | null;
  defaultCategory: RaceCategory;
  defaultBikeType: BikeType;
}

export interface EventTrackUploadDialogResult {
  eventId: number;
  category: RaceCategory;
  bikeType: BikeType;
  file: File;
}

@Component({
  selector: 'app-event-track-upload-dialog',
  templateUrl: './event-track-upload-dialog.component.html',
  styleUrls: ['./event-track-upload-dialog.component.css']
})
export class EventTrackUploadDialogComponent implements OnInit {
  selectedEventId: number | null = null;
  category: RaceCategory;
  bikeType: BikeType;
  file: File | null = null;

  constructor(
    private dialogRef: MatDialogRef<EventTrackUploadDialogComponent, EventTrackUploadDialogResult | undefined>,
    @Inject(MAT_DIALOG_DATA) public data: EventTrackUploadDialogData,
    private dialog: MatDialog
  ) {
    this.category = data.defaultCategory;
    this.bikeType = data.defaultBikeType;
  }

  ngOnInit(): void {
    if (this.data.events.length) {
      this.selectedEventId = this.data.defaultEventId ?? this.data.events[0].id;
    }
  }

  get selectedEvent(): RaceEvent | undefined {
    return this.data.events.find(event => event.id === this.selectedEventId);
  }

  onEventChange(eventId: number | null): void {
    this.selectedEventId = eventId;
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file && !file.name.toLowerCase().endsWith('.gpx')) {
      this.showMessage('Selecciona un archivo GPX válido.');
      input.value = '';
      this.file = null;
      return;
    }
    this.file = file;
  }

  cancel(): void {
    this.dialogRef.close();
  }

  confirm(): void {
    const validationError = this.validate();
    if (validationError) {
      this.showMessage(validationError);
      return;
    }

    this.dialogRef.close({
      eventId: this.selectedEventId!,
      category: this.category,
      bikeType: this.bikeType,
      file: this.file!
    });
  }

  private validate(): string | null {
    if (!this.selectedEventId) {
      return 'Selecciona un evento.';
    }
    if (!this.category) {
      return 'Selecciona tu categoría.';
    }
    if (!this.bikeType) {
      return 'Selecciona tu tipo de bicicleta.';
    }
    if (!this.file) {
      return 'Selecciona un archivo GPX.';
    }
    return null;
  }

  private showMessage(message: string): void {
    this.dialog.open(InfoDialogComponent, {
      width: '420px',
      data: {
        title: 'Datos requeridos',
        message
      }
    });
  }
}
