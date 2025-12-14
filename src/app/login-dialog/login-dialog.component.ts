import { Component } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { LoginErrorResponse, LoginSuccessResponse } from '../interfaces/auth';
import { VerificationDialogComponent } from '../verification-dialog/verification-dialog.component';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-login-dialog',
  templateUrl: './login-dialog.component.html',
  styleUrls: ['./login-dialog.component.css']
})
export class LoginDialogComponent {
  email = '';
  password = '';
  loading = false;
  errorMessage = '';
  errorExitCode: number | null = null;

  constructor(
    private dialogRef: MatDialogRef<LoginDialogComponent, LoginSuccessResponse>,
    private authService: AuthService,
    private dialog: MatDialog
  ) {}

  onSubmit(form: NgForm): void {
    if (this.loading || !form.valid) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.errorExitCode = null;

    this.authService.login(this.email, this.password).subscribe({
      next: response => {
        if(!environment.production)
          console.log(response)
        this.loading = false;
        if ((response as LoginErrorResponse).exitCode !== 0) {
          const loginError = response as LoginErrorResponse;
          if (this.isUnverifiedError(loginError)) {
            this.openVerificationDialog();
            return;
          }
          this.errorMessage = loginError.message || 'Usuario o contraseña erróneos';
          this.errorExitCode = loginError.exitCode;
          return;
        }

        const successResponse = response as LoginSuccessResponse;
        if (!successResponse.verified) {
          this.authService.saveSession(successResponse);
          this.openVerificationDialog();
          return;
        }
        this.authService.saveSession(successResponse);
        this.dialogRef.close(successResponse);
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        if (error.status === 401 && error.error) {
          const loginError = error.error as LoginErrorResponse;
          if (this.isUnverifiedError(loginError)) {
            this.openVerificationDialog();
            return;
          }
          this.errorMessage = loginError.message || 'Usuario o contraseña erróneos';
          this.errorExitCode = loginError.exitCode ?? null;
          return;
        }

        this.errorMessage = 'No se ha podido conectar con el servicio de autenticación.';
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  private isUnverifiedError(loginError: LoginErrorResponse): boolean {
    const message = loginError.message?.toLowerCase() ?? '';
    return loginError.exitCode === 3 || message.includes('verific');
  }

  private openVerificationDialog(): void {
    this.errorMessage = '';
    this.errorExitCode = null;

    this.dialog.open(VerificationDialogComponent, {
      data: { email: this.email }
    });
  }
}
