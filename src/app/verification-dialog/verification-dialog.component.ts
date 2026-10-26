import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AuthService } from '../services/auth.service';
import { RegisterErrorResponse, RegisterSuccessResponse } from '../interfaces/auth';
import { LanguageService } from '../services/language.service';
import { homeTranslations, HomeTranslationKey } from '../home/home-translations';

interface VerificationDialogData {
  email: string;
}

@Component({
  selector: 'app-verification-dialog',
  templateUrl: './verification-dialog.component.html',
  styleUrls: ['./verification-dialog.component.css']
})
export class VerificationDialogComponent {
  loading = false;
  successMessage = '';
  errorMessage = '';

  constructor(
    private dialogRef: MatDialogRef<VerificationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: VerificationDialogData,
    private authService: AuthService,
    public languageService: LanguageService
  ) {}

  t(key: HomeTranslationKey): string { return homeTranslations[this.languageService.current][key]; }

  resendVerification(): void {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.resendVerification(this.data.email).subscribe({
      next: response => {
        this.loading = false;

        if ((response as RegisterErrorResponse).exitCode && (response as RegisterErrorResponse).exitCode !== 0) {
          this.errorMessage = (response as RegisterErrorResponse).message || this.t('resendDefaultError');
          return;
        }

        this.successMessage = (response as RegisterSuccessResponse).message || this.t('verificationSent');
      },
      error: () => {
        this.loading = false;
        this.errorMessage = this.t('resendDefaultError');
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
