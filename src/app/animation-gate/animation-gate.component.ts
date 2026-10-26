import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { AnimationGate } from '../services/animation-access.service';
import { LoginDialogComponent } from '../login-dialog/login-dialog.component';
import { RegisterDialogComponent } from '../register-dialog/register-dialog.component';

@Component({
  selector: 'app-animation-gate',
  templateUrl: './animation-gate.component.html',
  styleUrls: ['./animation-gate.component.css']
})
export class AnimationGateComponent {
  @Input() gate: AnimationGate | null = null;
  @Output() back = new EventEmitter<void>();

  constructor(private dialog: MatDialog, private router: Router) {}

  register(): void {
    this.dialog.open(RegisterDialogComponent, { width: '480px', maxWidth: 'calc(100vw - 32px)', panelClass: 'tracketeo-auth-dialog' });
  }

  login(): void {
    this.dialog.open(LoginDialogComponent, { width: '440px', maxWidth: 'calc(100vw - 32px)', panelClass: 'tracketeo-auth-dialog' })
      .afterClosed().subscribe(session => {
        if (session) this.back.emit();
      });
  }

  premium(): void {
    void this.router.navigate(['/'], { fragment: 'premium' });
  }
}
