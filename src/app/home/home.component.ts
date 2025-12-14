import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { LoginDialogComponent } from '../login-dialog/login-dialog.component';
import { LoginSuccessResponse } from '../interfaces/auth';
import { RegisterDialogComponent } from '../register-dialog/register-dialog.component';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  loggedUser: LoginSuccessResponse | null = null;

  constructor(private dialog: MatDialog, private authService: AuthService) {}

  ngOnInit(): void {
    this.loggedUser = this.authService.getSession();
    this.authService.validateSessionWithBackend().subscribe(session => {
      this.loggedUser = session;
    });
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
