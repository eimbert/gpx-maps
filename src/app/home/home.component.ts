import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { LoginDialogComponent } from '../login-dialog/login-dialog.component';
import { LoginSuccessResponse } from '../interfaces/auth';
import { RegisterDialogComponent } from '../register-dialog/register-dialog.component';
import { AuthService, EntitlementsResponse } from '../services/auth.service';
import { Subscription } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, OnDestroy {
  loggedUser: LoginSuccessResponse | null = null;
  premiumDetailsOpen = false;
  usageDetailsOpen = false;
  entitlements: EntitlementsResponse | null = null;
  private sessionSub?: Subscription;

  constructor(
    private dialog: MatDialog,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const resetToken = this.route.snapshot.queryParamMap.get('token');
    if (resetToken) {
      this.router.navigate(['/reset-password'], {
        queryParams: { token: resetToken },
        replaceUrl: true
      });
      return;
    }

    this.loggedUser = this.authService.getSession();
    this.sessionSub = this.authService.sessionChanges$.subscribe(session => {
      this.loggedUser = session;
      if (session) this.loadEntitlements();
      else this.entitlements = null;
    });

    this.authService.validateSessionWithBackend().subscribe(session => {
      this.loggedUser = session;
      if (session) this.loadEntitlements();
      if (!session) {
        this.router.navigate(['/']);
      }
    });
  }

  ngOnDestroy(): void {
    this.sessionSub?.unsubscribe();
  }

  openLoginDialog(): void {
    this.dialog.open<LoginDialogComponent, void, LoginSuccessResponse>(LoginDialogComponent, {
      width: '440px'
    }).afterClosed().subscribe(result => {
      if (result) {
        this.loggedUser = result;
      }
    });
  }

  openRegisterDialog(): void {
    this.dialog.open<RegisterDialogComponent, void, void>(RegisterDialogComponent, {
      width: '480px'
    });
  }

  logout(): void {
    this.authService.clearSession();
    this.loggedUser = null;
    this.entitlements = null;
  }

  togglePremiumDetails(): void {
    this.premiumDetailsOpen = !this.premiumDetailsOpen;
  }

  toggleUsageDetails(): void {
    this.usageDetailsOpen = !this.usageDetailsOpen;
  }

  compactRemaining(limit: number, used: number): string {
    return limit < 0 ? '∞' : String(Math.max(0, limit - used));
  }

  remaining(limit: number, used: number): string {
    return limit < 0 ? 'Ilimitado' : `${Math.max(0, limit - used)} restantes`;
  }

  private loadEntitlements(): void {
    this.authService.getEntitlements().subscribe({
      next: entitlements => this.entitlements = entitlements,
      error: () => this.entitlements = null
    });
  }
}
