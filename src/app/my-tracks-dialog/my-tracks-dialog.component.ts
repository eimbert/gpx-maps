import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EventService } from '../services/event.service';
import { InfoDialogComponent, InfoDialogData, InfoDialogResult } from '../info-dialog/info-dialog.component';
import { TrackGpxFile } from '../interfaces/events';

export interface MyTrackRow {
  eventId: number;
  trackId: number;
  eventName: string;
  year: number;
  province?: string | null;
  population?: string | null;
  autonomousCommunity?: string | null;
  distanceKm: number;
  timeSeconds: number;
  totalTimeSeconds: number;
  gpxData?: string | null;
  gpxAsset?: string | null;
  fileName?: string | null;
  canDelete: boolean;
}

export interface MyTracksDialogData {
  tracks: MyTrackRow[];
  userId: number;
  personalNickname: string;
}

type SortColumn = 'year' | 'province' | 'population' | 'autonomousCommunity';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-my-tracks-dialog',
  templateUrl: './my-tracks-dialog.component.html',
  styleUrls: ['./my-tracks-dialog.component.css']
})
export class MyTracksDialogComponent {
  rows: MyTrackRow[] = [];
  sortColumn: SortColumn = 'year';
  sortDirection: SortDirection = 'asc';

  private readonly downloading = new Set<string>();
  private readonly deleting = new Set<string>();

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: MyTracksDialogData,
    private dialogRef: MatDialogRef<MyTracksDialogComponent>,
    private dialog: MatDialog,
    private http: HttpClient,
    private eventService: EventService
  ) {
    this.rows = [...data.tracks];
  }

  close(): void {
    this.dialogRef.close();
  }

  formatDuration(seconds: number): string {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  isDownloading(row: MyTrackRow): boolean {
    return this.downloading.has(this.buildRowKey(row));
  }

  isDeleting(row: MyTrackRow): boolean {
    return this.deleting.has(this.buildRowKey(row));
  }

  get sortedRows(): MyTrackRow[] {
    return [...this.rows].sort((a, b) => this.compareRows(a, b));
  }

  sortBy(column: SortColumn): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }

    this.sortColumn = column;
    this.sortDirection = 'asc';
  }

  resolveSortIndicator(column: SortColumn): string {
    if (this.sortColumn !== column) return '⇅';
    return this.sortDirection === 'asc' ? '▲' : '▼';
  }

  async downloadTrack(row: MyTrackRow): Promise<void> {
    const key = this.buildRowKey(row);
    this.downloading.add(key);

    try {
      const gpx = await this.resolveGpxContent(row);
      if (!gpx) {
        this.showInfo('No se pudo preparar la descarga del GPX.');
        return;
      }

      const blob = new Blob([gpx], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = row.fileName || `${row.eventName}-${row.year}.gpx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } finally {
      this.downloading.delete(key);
    }
  }

  confirmDelete(row: MyTrackRow): void {
    if (!row.canDelete) {
      this.showInfo('Solo puedes eliminar tracks que hayas subido tú.');
      return;
    }

    const dialogRef = this.dialog.open<InfoDialogComponent, InfoDialogData, InfoDialogResult>(InfoDialogComponent, {
      width: '440px',
      data: {
        title: 'Eliminar track',
        message: '¿Seguro que quieres eliminar este track? Esta acción no se puede deshacer.',
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'confirm') {
        this.deleteRow(row);
      }
    });
  }

  private deleteRow(row: MyTrackRow): void {
    const key = this.buildRowKey(row);
    this.deleting.add(key);

    this.eventService.removeTrack(row.eventId, row.trackId, this.data.userId).subscribe(removed => {
      this.deleting.delete(key);
      if (!removed) {
        this.showInfo('No se pudo eliminar el track.');
        return;
      }

      this.rows = this.rows.filter(current => this.buildRowKey(current) !== key);
      if (!this.rows.length) {
        this.close();
      }
    });
  }

  private async resolveGpxContent(row: MyTrackRow): Promise<string | null> {
    const decoded = this.decodeGpxContent(row.gpxData);
    if (decoded) return decoded;

    if (row.gpxAsset) {
      try {
        return await firstValueFrom(this.http.get(row.gpxAsset, { responseType: 'text' }));
      } catch {
        return null;
      }
    }

    const gpxFile = await this.fetchTrackGpx(row.trackId);
    if (gpxFile?.routeXml) {
      row.fileName = gpxFile.fileName || row.fileName;
      return this.decodeGpxContent(gpxFile.routeXml);
    }

    return null;
  }

  private decodeGpxContent(raw?: string | null): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed.includes('<')) return trimmed;
    const base64 = trimmed.startsWith('data:') ? trimmed.split(',')[1] ?? '' : trimmed;
    try {
      return decodeURIComponent(escape(atob(base64.replace(/\s/g, ''))));
    } catch {
      try {
        return atob(base64.replace(/\s/g, ''));
      } catch {
        return null;
      }
    }
  }

  private showInfo(message: string): void {
    this.dialog.open<InfoDialogComponent, InfoDialogData, InfoDialogResult>(InfoDialogComponent, {
      width: '420px',
      data: {
        title: 'Aviso',
        message,
        confirmLabel: 'Aceptar'
      }
    });
  }

  private buildRowKey(row: MyTrackRow): string {
    return `${row.eventId}:${row.trackId}`;
  }

  private async fetchTrackGpx(trackId: number): Promise<TrackGpxFile | null> {
    try {
      return await firstValueFrom(this.eventService.getTrackGpx(trackId));
    } catch {
      return null;
    }
  }

  private compareRows(a: MyTrackRow, b: MyTrackRow): number {
    const direction = this.sortDirection === 'asc' ? 1 : -1;

    if (this.sortColumn === 'year') {
      return direction * (a.year - b.year);
    }

    const key = this.sortColumn;
    const valueA = (a[key] ?? '').toString().toLocaleLowerCase();
    const valueB = (b[key] ?? '').toString().toLocaleLowerCase();

    if (valueA === valueB) {
      return direction * a.eventName.localeCompare(b.eventName);
    }

    return direction * valueA.localeCompare(valueB);
  }
}
