import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { RaceEvent } from '../interfaces/events';

export interface EventCreateDialogResult {
  event: RaceEvent;
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
    logo: ''
  };

  constructor(private dialogRef: MatDialogRef<EventCreateDialogComponent, EventCreateDialogResult | undefined>) { }

  onCancel(): void {
    this.dialogRef.close();
  }

  async onSave(): Promise<void> {
    if (!this.newEvent.name.trim() || !this.newEvent.population.trim()) {
      alert('Completa el nombre y la población del evento.');
      return;
    }

    const newId = `${this.newEvent.name.toLowerCase().replace(/\s+/g, '-')}-${this.newEvent.year}`;
    const event: RaceEvent = {
      id: newId,
      name: this.newEvent.name.trim(),
      population: this.newEvent.population.trim(),
      autonomousCommunity: this.newEvent.autonomousCommunity.trim(),
      year: this.newEvent.year,
      logo: this.newEvent.logo,
      modalities: [
        {
          id: `${newId}-modalidad-1`,
          name: this.newEvent.modalityName || 'Recorrido principal',
          distanceKm: this.newEvent.distanceKm || 0
        }
      ],
      tracks: []
    };

    this.dialogRef.close({ event });
  }

  async handleLogoUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.newEvent.logo = reader.result as string;
    };
    reader.readAsDataURL(file);
  }
}
