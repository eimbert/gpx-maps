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
      // En móvil, sin backdrop los taps pueden "atravesar" el diálogo y volver
      // a disparar acciones de la pantalla (p.ej. animar track), dando la sensación
      // de que el botón "Aceptar" no cierra el aviso.
      hasBackdrop: true,
      autoFocus: false,
      panelClass: ['info-toast-dialog', 'tracketeo-message-dialog']
    });

    this.messageRef = dialogRef;
    dialogRef.afterClosed().subscribe(() => {
      if (this.messageRef === dialogRef) {
        this.messageRef = undefined;
      }
    });
  }
}
