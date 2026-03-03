import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { RoundTripComplexity, RoundTripProfile } from '../services/plan.service';

export type RoundTripOptionsDialogData = {
  profile: RoundTripProfile;
  complexity: RoundTripComplexity;
  lengthKm: number;
  profileOptions: Array<{ value: RoundTripProfile; label: string }>;
  complexityOptions: Array<{ value: RoundTripComplexity; label: string }>;
};

export type RoundTripOptionsDialogResult = {
  profile: RoundTripProfile;
  complexity: RoundTripComplexity;
  lengthKm: number;
};

@Component({
  selector: 'app-roundtrip-options-dialog',
  templateUrl: './roundtrip-options-dialog.component.html',
  styleUrls: ['./roundtrip-options-dialog.component.css']
})
export class RoundTripOptionsDialogComponent {
  profile: RoundTripProfile;
  complexity: RoundTripComplexity;
  lengthKm: number;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: RoundTripOptionsDialogData,
    private dialogRef: MatDialogRef<RoundTripOptionsDialogComponent, RoundTripOptionsDialogResult | undefined>
  ) {
    this.profile = data.profile;
    this.complexity = data.complexity;
    this.lengthKm = data.lengthKm;
  }

  cancel(): void {
    this.dialogRef.close();
  }

  generate(): void {
    this.dialogRef.close({
      profile: this.profile,
      complexity: this.complexity,
      lengthKm: this.lengthKm
    });
  }
}
