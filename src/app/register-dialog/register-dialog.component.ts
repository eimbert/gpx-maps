import { Component } from '@angular/core';
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
export class RegisterDialogComponent {
  email = '';
  password = '';
  name = '';
  nickname = '';
  loading = false;
  errorMessage = '';
  successMessage = '';
  environment = environment;

  constructor(
    private dialogRef: MatDialogRef<RegisterDialogComponent, RegisterSuccessResponse | void>,
    private authService: AuthService
  ) {}

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
          console.log(response);
        }

        this.loading = false;

        if ((response as RegisterErrorResponse).exitCode && (response as RegisterErrorResponse).exitCode !== 0) {
          this.errorMessage = (response as RegisterErrorResponse).message || 'No se ha podido completar el registro';
          return;
        }

        this.successMessage = (response as RegisterSuccessResponse).message || 'Registro completado';
        this.dialogRef.close(response as RegisterSuccessResponse);
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

  close(): void {
    this.dialogRef.close();
  }
}
