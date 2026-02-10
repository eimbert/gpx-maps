import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PlanFolder } from '../interfaces/plan';

export interface PlanTrackDialogData {
  routeName: string;
  folders: PlanFolder[];
}

export interface PlanTrackDialogResult {
  mode: 'new' | 'existing';
  folderId: number | null;
  newFolderName: string | null;
}

@Component({
  selector: 'app-plan-track-dialog',
  templateUrl: './plan-track-dialog.component.html',
  styleUrls: ['./plan-track-dialog.component.css']
})
export class PlanTrackDialogComponent {
  mode: 'new' | 'existing' = 'new';
  selectedFolderId: number | null = null;
  newFolderName = '';

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: PlanTrackDialogData,
    private dialogRef: MatDialogRef<PlanTrackDialogComponent, PlanTrackDialogResult | undefined>
  ) {
    this.newFolderName = (data.routeName || '').trim();
    if (data.folders.length) {
      this.selectedFolderId = data.folders[0].id;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  confirm(): void {
    if (this.mode === 'new') {
      const folderName = this.newFolderName.trim();
      if (!folderName) return;
      this.dialogRef.close({
        mode: 'new',
        folderId: null,
        newFolderName: folderName
      });
      return;
    }

    if (!this.selectedFolderId) return;
    this.dialogRef.close({
      mode: 'existing',
      folderId: this.selectedFolderId,
      newFolderName: null
    });
  }

  get canConfirm(): boolean {
    if (this.mode === 'new') {
      return !!this.newFolderName.trim();
    }
    return Number.isFinite(this.selectedFolderId ?? NaN);
  }
}
