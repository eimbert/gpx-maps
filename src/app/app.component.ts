import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { PwaInstallService } from './services/pwa-install.service';
import { LanguageService } from './services/language.service';
import { DashboardStateService } from './services/dashboard-state.service';
import { AuthService } from './services/auth.service';
import { ScreenTextKey, selectedUiText } from './services/screen-texts';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  // Keep installation events available even when the user first visits another route.
  constructor(public router: Router, private installation: PwaInstallService, private languageService: LanguageService, public dashboardState: DashboardStateService, public authService: AuthService) {}
  get pageInitials(): string { return (this.authService.getSession()?.name || '').split(/\s+/).filter(Boolean).slice(0,2).map(p => p[0]).join('').toUpperCase() || 'TU'; }
  get referencePage(): string {
    const key = ({ '/analysis': 'analyzeRoute', '/plan': 'planningTitle', '/garmin': 'inboxNav' } as Record<string, ScreenTextKey>)[this.router.url.split('?')[0]];
    return key ? selectedUiText(key) : '';
  }
  get referenceSection(): ScreenTextKey {
    return this.router.url.startsWith('/plan') ? 'outingsNav' : this.router.url.startsWith('/analysis') ? 'tools' : 'yourSpace';
  }
  title = 'gpx-map-viewer';
}
