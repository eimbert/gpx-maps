import { Injectable } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { InfoDialogComponent, InfoDialogData, InfoDialogResult } from '../info-dialog/info-dialog.component';

@Injectable({ providedIn: 'root' })
export class InfoMessageService {
  private messageRef?: MatDialogRef<InfoDialogComponent, InfoDialogResult>;

  constructor(private dialog: MatDialog) {}

  showMessage(data: InfoDialogData): void {
    this.messageRef?.close();

    const dialogRef = this.dialog.open<InfoDialogComponent, InfoDialogData, InfoDialogResult>(InfoDialogComponent, {
      width: '420px',
      data,
      hasBackdrop: false,
      autoFocus: false,
      panelClass: 'info-toast-dialog',
      position: {
        top: '24px',
        right: '24px'
      }
    });

    this.messageRef = dialogRef;
    dialogRef.afterClosed().subscribe(() => {
      if (this.messageRef === dialogRef) {
        this.messageRef = undefined;
      }
    });
  }
}
