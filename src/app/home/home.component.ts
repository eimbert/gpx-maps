import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { LoginDialogComponent } from '../login-dialog/login-dialog.component';
import { LoginSuccessResponse } from '../interfaces/auth';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {
  loggedUser: LoginSuccessResponse | null = null;

  constructor(private dialog: MatDialog) {}

  openLoginDialog(): void {
    this.dialog.open<LoginDialogComponent, void, LoginSuccessResponse>(LoginDialogComponent, {
      width: '440px'
    }).afterClosed().subscribe(result => {
      if (result) {
        this.loggedUser = result;
      }
    });
  }
}
