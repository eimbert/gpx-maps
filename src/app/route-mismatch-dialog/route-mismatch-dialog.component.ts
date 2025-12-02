import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface RouteMismatchDialogData {
  percentage: number;
}

@Component({
  selector: 'app-route-mismatch-dialog',
  templateUrl: './route-mismatch-dialog.component.html',
  styleUrls: ['./route-mismatch-dialog.component.scss']
})
export class RouteMismatchDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<RouteMismatchDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: RouteMismatchDialogData
  ) {}

  cancelar(): void {
    this.dialogRef.close(false);
  }

  continuar(): void {
    this.dialogRef.close(true);
  }
}
