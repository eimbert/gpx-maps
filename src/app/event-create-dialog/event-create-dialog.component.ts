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
    modalityName: 'Recorrido 20 km',
    distanceKm: 20,
    logoBase64: '',
    logoMime: ''
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
      logoBase64: this.newEvent.logoBase64 || null,
      logoMime: this.newEvent.logoMime || null,
      modalities: [
        {
          name: this.newEvent.modalityName || 'Recorrido principal',
          distanceKm: this.newEvent.distanceKm || 0
        }
      ]
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
      const [mimePart, base64Part] = dataUrl.split(';base64,');
      const mime = mimePart?.replace('data:', '') || '';
      this.newEvent.logoMime = mime;
      this.newEvent.logoBase64 = base64Part || '';
    };
    reader.readAsDataURL(file);
  }
}
