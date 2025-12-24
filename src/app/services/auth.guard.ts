import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { InfoDialogComponent, InfoDialogData } from '../info-dialog/info-dialog.component';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router, private dialog: MatDialog) {}

  canActivate(): Observable<boolean | UrlTree> {
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
      message: 'La sección de eventos y rankings es exclusiva para usuarios registrados. Inicia sesión o regístrate desde la pantalla principal.',
      confirmLabel: 'OK'
    };

    this.dialog.open<InfoDialogComponent, InfoDialogData>(InfoDialogComponent, {
      width: '420px',
      data: dialogData
    });
  }

  private showSessionExpiredDialog(): void {
    const dialogData: InfoDialogData = {
      title: 'Sesión expirada',
      message: 'Tu sesión ha expirado. Inicia sesión de nuevo para acceder a eventos y rankings.',
      confirmLabel: 'Volver al inicio'
    };

    this.dialog.open<InfoDialogComponent, InfoDialogData>(InfoDialogComponent, {
      width: '420px',
      data: dialogData
    });
  }
}
