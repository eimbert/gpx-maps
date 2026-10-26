import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { PasswordRecoveryErrorResponse } from '../interfaces/auth';
import { AuthService } from '../services/auth.service';
import { LanguageService } from '../services/language.service';
import { homeTranslations, HomeTranslationKey } from '../home/home-translations';

@Component({
  selector: 'app-forgot-password-dialog',
  templateUrl: './forgot-password-dialog.component.html',
  styleUrls: ['./forgot-password-dialog.component.css']
})
export class ForgotPasswordDialogComponent {
  email = '';
  loading = false;
  successMessage = '';
  errorMessage = '';

  constructor(
    private dialogRef: MatDialogRef<ForgotPasswordDialogComponent>,
    private authService: AuthService,
    public languageService: LanguageService
  ) {}

  t(key: HomeTranslationKey): string { return homeTranslations[this.languageService.current][key]; }

  onSubmit(form: NgForm): void {
    if (!form.valid || this.loading) return;

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.forgotPassword(this.email).subscribe({
      next: response => {
        this.loading = false;
        if ((response as PasswordRecoveryErrorResponse).exitCode !== 0) {
          const error = response as PasswordRecoveryErrorResponse;
          this.errorMessage = error.message || this.t('recoveryDefaultError');
          return;
        }

        this.successMessage = this.t('recoverySuccess');
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        if (error.error) {
          const responseError = error.error as PasswordRecoveryErrorResponse;
          this.errorMessage = responseError.message || this.t('recoveryDefaultError');
          return;
        }

        this.errorMessage = this.t('authDefaultError');
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
