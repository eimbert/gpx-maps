import { Component, OnDestroy, OnInit } from '@angular/core';
import { PwaInstallService } from '../services/pwa-install.service';

@Component({
  selector: 'app-install-prompt',
  host: { '[style.display]': 'ready && installation.canOffer ? "block" : "none"' },
  templateUrl: './install-prompt.component.html',
  styleUrls: ['./install-prompt.component.css']
})
export class InstallPromptComponent implements OnInit, OnDestroy {
  ready = false;
  instructionsOpen = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(public installation: PwaInstallService) {}

  ngOnInit(): void {
    this.timer = setTimeout(() => this.ready = true, 5000);
  }

  install(): void {
    if (this.installation.isIos) this.instructionsOpen = !this.instructionsOpen;
    else void this.installation.install();
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }
}
