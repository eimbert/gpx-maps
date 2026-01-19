import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { map } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { InfoDialogData } from '../info-dialog/info-dialog.component';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import { InfoMessageService } from './info-message.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router,
    private infoMessageService: InfoMessageService
  ) {}

  canActivate(): Observable<boolean | UrlTree> {
    if (environment.devBypassAuthGuard) {
      return of(true);
    }

    const hadStoredSession = !!this.authService.getSession();

    return this.authService.validateSessionWithBackend().pipe(
      map(session => {
        if (session) {
          return true;
        }

        if (hadStoredSession) {
          this.showSessionExpiredDialog();
        } else {
          this.showAccessDeniedDialog();
        }

        return this.router.createUrlTree(['/']);
      })
    );
  }

  private showAccessDeniedDialog(): void {
    const dialogData: InfoDialogData = {
      title: 'Función para usuarios registrados',
      message: 'La sección solicitada es exclusiva para usuarios registrados. Regístrate o inicia sesión.',
      confirmLabel: 'OK'
    };

    this.infoMessageService.showMessage(dialogData);
  }

  private showSessionExpiredDialog(): void {
    const dialogData: InfoDialogData = {
      title: 'Sesión expirada',
      message: 'Tu sesión ha expirado. Inicia sesión de nuevo para acceder a eventos y rankings.',
      confirmLabel: 'Volver al inicio'
    };

    this.infoMessageService.showMessage(dialogData);
  }
}
