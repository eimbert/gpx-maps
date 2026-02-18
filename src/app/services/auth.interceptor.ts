import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from 'src/environments/environment';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService, private router: Router) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!this.shouldAttachAuthHeader(req.url)) {
      return next.handle(req);
    }

    const token = this.authService.getValidToken();
    const hasSession = !!this.authService.getSession();

    const authReq = token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

    if (!token && this.authService.getSession()) {
      this.handleInvalidToken();
    }

    return next.handle(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        if ((error.status === 401 || error.status === 403) && hasSession) {
          this.handleInvalidToken();
        }

        return throwError(() => error);
      })
    );
  }

  private handleInvalidToken(): void {
    this.authService.clearSession();
    this.router.navigate(['/']);
  }

  private shouldAttachAuthHeader(url: string): boolean {
    if (!url) return false;

    if (!/^https?:\/\//i.test(url)) {
      return true;
    }

    try {
      const requestUrl = new URL(url);
      const apiUrl = new URL(environment.tracksApiBase);
      return requestUrl.origin === apiUrl.origin;
    } catch {
      return false;
    }
  }
}
