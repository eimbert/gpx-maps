import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface TrackMetadataDialogResult {
  names: string[];
  colors: string[];
}

@Component({
  selector: 'app-track-metadata-dialog',
  templateUrl: './track-metadata-dialog.component.html',
  styleUrls: ['./track-metadata-dialog.component.scss']
})
export class TrackMetadataDialogComponent {
  entries: { name: string; color: string }[] = [];

  constructor(
    private dialogRef: MatDialogRef<TrackMetadataDialogComponent, TrackMetadataDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: TrackMetadataDialogResult
  ) {
    this.entries = data.names.map((name, index) => ({
      name: name ?? `Track ${index + 1}`,
      color: data.colors[index] ?? '#3b82f6'
    }));
  }

  cancelar(): void {
    this.dialogRef.close();
  }

  guardar(): void {
    this.dialogRef.close({
      names: this.entries.map((entry, index) => entry.name?.trim() || `Track ${index + 1}`),
      colors: this.entries.map((entry, index) => entry.color || '#3b82f6')
    });
  }
}
