import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

export interface StandaloneTrackUploadResult {
  file: File;
  title: string | null;
  shared: boolean;
}

@Component({
  selector: 'app-standalone-track-upload-dialog',
  templateUrl: './standalone-track-upload-dialog.component.html',
  styleUrls: ['./standalone-track-upload-dialog.component.css']
})
export class StandaloneTrackUploadDialogComponent {
  file: File | null = null;
  title = '';
  description = '';
  shared = true;

  constructor(private dialogRef: MatDialogRef<StandaloneTrackUploadDialogComponent, StandaloneTrackUploadResult | undefined>) {}

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = input.files?.[0] ?? null;
    if (selected && !selected.name.toLowerCase().endsWith('.gpx')) {
      input.value = '';
      this.file = null;
      return;
    }
    this.file = selected;
  }

  cancel(): void {
    this.dialogRef.close();
  }

  confirm(): void {
    if (!this.file) return;
    this.dialogRef.close({
      file: this.file,
      title: this.title.trim() || null,
      shared: this.shared
    });
  }
}
