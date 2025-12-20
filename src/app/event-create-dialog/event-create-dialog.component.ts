import { Component } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { CreateEventPayload } from '../interfaces/events';
import { InfoDialogComponent } from '../info-dialog/info-dialog.component';

export interface EventCreateDialogResult {
  event: CreateEventPayload;
}

@Component({
  selector: 'app-event-create-dialog',
  templateUrl: './event-create-dialog.component.html',
  styleUrls: ['./event-create-dialog.component.css']
})
export class EventCreateDialogComponent {
  newEvent = {
    name: '',
    population: '',
    autonomousCommunity: '',
    year: new Date().getFullYear(),
    logoBlob: '',
    logoMime: '',
    gpxMaster: '',
    gpxMasterFileName: ''
  };

  constructor(
    private dialogRef: MatDialogRef<EventCreateDialogComponent, EventCreateDialogResult | undefined>,
    private dialog: MatDialog
  ) { }

  private showMessage(message: string): void {
    this.dialog.open(InfoDialogComponent, {
      width: '420px',
      data: {
        title: 'Datos requeridos',
        message
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  async onSave(): Promise<void> {
    if (!this.newEvent.name.trim() || !this.newEvent.population.trim()) {
      this.showMessage('Completa el nombre y la población del evento.');
      return;
    }

    if (!this.newEvent.year || this.newEvent.year <= 0) {
      this.showMessage('Introduce un año válido (número entero positivo).');
      return;
    }

    const event: CreateEventPayload = {
      name: this.newEvent.name.trim(),
      population: this.newEvent.population.trim(),
      autonomousCommunity: this.newEvent.autonomousCommunity.trim(),
      year: this.newEvent.year,
      logoBlob: this.newEvent.logoBlob || null,
      logoMime: this.newEvent.logoMime || null,
      gpxMaster: this.newEvent.gpxMaster || null,
      gpxMasterFileName: this.newEvent.gpxMasterFileName || null,
    };

    this.dialogRef.close({ event });
  }

  async handleLogoUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [mimePart, logoBlob] = dataUrl.split(';base64,');
      const mime = mimePart?.replace('data:', '') || '';
      this.newEvent.logoMime = mime;
      this.newEvent.logoBlob = logoBlob || '';
    };
    reader.readAsDataURL(file);
  }

  async handleGpxUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.gpx')) {
      this.showMessage('Selecciona un archivo GPX válido.');
      input.value = '';
      return;
    }

    const text = await file.text();
    if (!this.isValidGpx(text)) {
      this.showMessage('El archivo GPX no parece válido.');
      input.value = '';
      return;
    }

    this.newEvent.gpxMaster = this.encodeBase64(text);
    this.newEvent.gpxMasterFileName = file.name;
  }

  private isValidGpx(content: string): boolean {
    try {
      const parser = new DOMParser();
      const gpx = parser.parseFromString(content, 'application/xml');
      return !gpx.getElementsByTagName('parsererror').length && gpx.getElementsByTagName('trkpt').length > 0;
    } catch {
      return false;
    }
  }

  private encodeBase64(content: string): string {
    try {
      return btoa(unescape(encodeURIComponent(content)));
    } catch {
      return btoa(content);
    }
  }
}
