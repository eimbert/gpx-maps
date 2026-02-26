import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PasswordRecoveryErrorResponse } from '../interfaces/auth';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.css']
})
export class ResetPasswordComponent implements OnInit {
  token = '';
  password = '';
  confirmPassword = '';
  loading = false;
  successMessage = '';
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.errorMessage = 'El enlace de recuperación no es válido.';
    }
  }

  onSubmit(form: NgForm): void {
    if (!form.valid || this.loading || !this.token) return;

    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Las contraseñas no coinciden.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.resetPassword(this.token, this.password).subscribe({
      next: response => {
        this.loading = false;
        if ((response as PasswordRecoveryErrorResponse).exitCode !== 0) {
          const error = response as PasswordRecoveryErrorResponse;
          this.errorMessage = error.message || 'No ha sido posible actualizar la contraseña.';
          return;
        }

        this.successMessage = 'Contraseña actualizada. Ya puedes iniciar sesión con tu nueva clave.';
        setTimeout(() => {
          this.router.navigate(['/']);
        }, 2000);
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        if (error.error) {
          const responseError = error.error as PasswordRecoveryErrorResponse;
          this.errorMessage = responseError.message || 'No ha sido posible actualizar la contraseña.';
          return;
        }

        this.errorMessage = 'No se ha podido conectar con el servicio de autenticación.';
      }
    });
  }
}
