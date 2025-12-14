import { Component } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { AuthService } from '../services/auth.service';
import { LoginErrorResponse, LoginSuccessResponse } from '../interfaces/auth';
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

  constructor(
    private dialogRef: MatDialogRef<LoginDialogComponent, LoginSuccessResponse>,
    private authService: AuthService
  ) {}

  onSubmit(form: NgForm): void {
    if (this.loading || !form.valid) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.authService.login(this.email, this.password).subscribe({
      next: response => {
        if(!environment.production)
          console.log(response)
        this.loading = false;
        if ((response as LoginErrorResponse).exitCode !== 0) {
          this.errorMessage = (response as LoginErrorResponse).message || 'Usuario o contraseña erróneos';
          return;
        }

        this.dialogRef.close(response as LoginSuccessResponse);
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No se ha podido conectar con el servicio de autenticación.';
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
