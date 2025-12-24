import { Component, OnDestroy } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { RegisterErrorResponse, RegisterSuccessResponse } from '../interfaces/auth';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-register-dialog',
  templateUrl: './register-dialog.component.html',
  styleUrls: ['./register-dialog.component.css']
})
export class RegisterDialogComponent implements OnDestroy {
  email = '';
  password = '';
  name = '';
  nickname = '';
  loading = false;
  errorMessage = '';
  successMessage = '';
  verificationEmailSent = false;
  resendCountdown = 0;
  private readonly resendCooldownSeconds = 45;
  private resendIntervalId: number | null = null;
  environment = environment;

  constructor(
    private dialogRef: MatDialogRef<RegisterDialogComponent, RegisterSuccessResponse | void>,
    private authService: AuthService
  ) {}

  ngOnDestroy(): void {
    this.clearResendInterval();
  }

  get passwordPattern(): string {
    return '^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{6,}$';
  }

  onSubmit(form: NgForm): void {
    if (this.loading || !form.valid) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.register(this.email, this.password, this.name, this.nickname).subscribe({
      next: response => {
        if (!environment.production) {
          // console.log(response);
        }

        this.loading = false;

        if ((response as RegisterErrorResponse).exitCode && (response as RegisterErrorResponse).exitCode !== 0) {
          this.errorMessage = (response as RegisterErrorResponse).message || 'No se ha podido completar el registro';
          return;
        }

        this.handleVerificationEmailSent((response as RegisterSuccessResponse).message);
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        if (error.status === 400 && error.error) {
          const registerError = error.error as RegisterErrorResponse;
          this.errorMessage = registerError.message || 'No se ha podido completar el registro';
          return;
        }

        this.errorMessage = 'No se ha podido conectar con el servicio de autenticación.';
      }
    });
  }

  resendVerification(): void {
    if (this.loading || this.resendCountdown > 0 || !this.email) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.resendVerification(this.email).subscribe({
      next: response => {
        this.loading = false;

        if ((response as RegisterErrorResponse).exitCode && (response as RegisterErrorResponse).exitCode !== 0) {
          this.errorMessage = (response as RegisterErrorResponse).message || 'No se pudo reenviar el correo.';
          return;
        }

        this.handleVerificationEmailSent((response as RegisterSuccessResponse).message || 'Te reenviamos el correo de verificación.');
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No se ha podido reenviar el correo de verificación.';
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  private handleVerificationEmailSent(message?: string): void {
    this.verificationEmailSent = true;
    this.successMessage = message || 'Te enviamos un correo, revisa tu bandeja para completar el registro.';
    this.errorMessage = '';
    this.startResendCountdown();
  }

  private startResendCountdown(): void {
    this.clearResendInterval();
    this.resendCountdown = this.resendCooldownSeconds;
    this.resendIntervalId = window.setInterval(() => {
      this.resendCountdown -= 1;
      if (this.resendCountdown <= 0) {
        this.clearResendInterval();
      }
    }, 1000);
  }

  private clearResendInterval(): void {
    if (this.resendIntervalId !== null) {
      window.clearInterval(this.resendIntervalId);
      this.resendIntervalId = null;
    }
  }
}
