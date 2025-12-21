import { Component, Inject, OnInit } from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { BikeType, EventModality, RaceCategory, RaceEvent } from '../interfaces/events';
import { InfoDialogComponent } from '../info-dialog/info-dialog.component';

export interface EventTrackUploadDialogData {
  events: RaceEvent[];
  categories: RaceCategory[];
  bikeTypes: BikeType[];
  defaultEventId: number | null;
  defaultModalityId: number | null;
  defaultCategory: RaceCategory;
  defaultBikeType: BikeType;
  defaultDistanceKm: number | null;
}

export interface EventTrackUploadDialogResult {
  eventId: number;
  modalityId: number | null;
  category: RaceCategory;
  bikeType: BikeType;
  distanceKm: number;
  file: File;
}

@Component({
  selector: 'app-event-track-upload-dialog',
  templateUrl: './event-track-upload-dialog.component.html',
  styleUrls: ['./event-track-upload-dialog.component.css']
})
export class EventTrackUploadDialogComponent implements OnInit {
  selectedEventId: number | null = null;
  selectedModalityId: number | null = null;
  category: RaceCategory;
  bikeType: BikeType;
  distanceKm: number | null;
  file: File | null = null;

  constructor(
    private dialogRef: MatDialogRef<EventTrackUploadDialogComponent, EventTrackUploadDialogResult | undefined>,
    @Inject(MAT_DIALOG_DATA) public data: EventTrackUploadDialogData,
    private dialog: MatDialog
  ) {
    this.category = data.defaultCategory;
    this.bikeType = data.defaultBikeType;
    this.distanceKm = data.defaultDistanceKm;
  }

  ngOnInit(): void {
    if (this.data.events.length) {
      this.selectedEventId = this.data.defaultEventId ?? this.data.events[0].id;
      this.syncModalityFromEvent(this.data.defaultModalityId);
    }
  }

  get selectedEvent(): RaceEvent | undefined {
    return this.data.events.find(event => event.id === this.selectedEventId);
  }

  get modalities(): EventModality[] {
    return this.selectedEvent?.modalities ?? [];
  }

  onEventChange(eventId: number | null): void {
    this.selectedEventId = eventId;
    this.syncModalityFromEvent(null);
  }

  onModalityChange(modalityId: number | null): void {
    this.selectedModalityId = modalityId;
    const modality = this.modalities.find(m => m.id === modalityId);
    if (modality) {
      this.distanceKm = modality.distanceKm;
    }
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
      modalityId: this.selectedModalityId,
      category: this.category,
      bikeType: this.bikeType,
      distanceKm: Number(this.distanceKm),
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
    const distance = Number(this.distanceKm);
    if (!Number.isFinite(distance) || distance <= 0) {
      return 'Añade la distancia en kilómetros del recorrido.';
    }
    if (!this.file) {
      return 'Selecciona un archivo GPX.';
    }
    return null;
  }

  private syncModalityFromEvent(preferredModalityId: number | null): void {
    const modality = this.modalities.find(m => m.id === preferredModalityId) ?? this.modalities[0];
    this.selectedModalityId = modality?.id ?? null;
    this.distanceKm = modality?.distanceKm ?? this.distanceKm ?? null;
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
