import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { LoginDialogComponent } from '../login-dialog/login-dialog.component';
import { LoginSuccessResponse } from '../interfaces/auth';
import { RegisterDialogComponent } from '../register-dialog/register-dialog.component';
import { AuthService } from '../services/auth.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, OnDestroy {
  loggedUser: LoginSuccessResponse | null = null;
  private sessionSub?: Subscription;

  constructor(private dialog: MatDialog, private authService: AuthService, private router: Router) {}

  ngOnInit(): void {
    this.loggedUser = this.authService.getSession();
    this.sessionSub = this.authService.sessionChanges$.subscribe(session => {
      this.loggedUser = session;
    });

    this.authService.validateSessionWithBackend().subscribe(session => {
      this.loggedUser = session;
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
  }
}
