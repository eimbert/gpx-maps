import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { PasswordRecoveryErrorResponse } from '../interfaces/auth';
import { AuthService } from '../services/auth.service';

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
    private authService: AuthService
  ) {}

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
          this.errorMessage = error.message || 'No ha sido posible iniciar la recuperación de contraseña.';
          return;
        }

        this.successMessage = 'Si el correo existe, recibirás instrucciones para recuperar la contraseña.';
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        if (error.error) {
          const responseError = error.error as PasswordRecoveryErrorResponse;
          this.errorMessage = responseError.message || 'No ha sido posible iniciar la recuperación de contraseña.';
          return;
        }

        this.errorMessage = 'No se ha podido conectar con el servicio de autenticación.';
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
