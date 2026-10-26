import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LanguageService } from '../services/language.service';
import { WahooConnectionStatus, WahooInboxService, WahooRideStatus } from './wahoo-inbox.service';
import { wahooTranslations, WahooTextKey } from './wahoo-translations';
import { providerTranslations } from './provider-translations';

@Component({
  selector: 'app-wahoo-inbox',
  templateUrl: './wahoo-inbox.component.html',
  styleUrls: ['./polar-inbox.component.css']
})
export class WahooInboxComponent implements OnInit {
  @Input() expanded = false;
  @Output() statusChange = new EventEmitter<WahooConnectionStatus>();
  @Output() ridesChange = new EventEmitter<WahooRideStatus[]>();
  @Output() openSettings = new EventEmitter<void>();
  status: WahooConnectionStatus | null = null;
  busy = false;
  private refreshing = false;
  message: WahooTextKey | null = null;
  error: WahooTextKey | null = null;

  constructor(private inbox: WahooInboxService, private route: ActivatedRoute,
    private router: Router, public languageService: LanguageService) {}

  t(key: WahooTextKey): string { return wahooTranslations[this.languageService.current][key]; }
  get providerText() { return providerTranslations[this.languageService.current]; }

  async ngOnInit(): Promise<void> {
    const outcome = this.route.snapshot.queryParamMap.get('wahoo');
    if (outcome === 'connected') this.message = 'connected';
    if (outcome === 'error') this.error = 'authorizationFailed';
    if (outcome) {
      setTimeout(() => this.openSettings.emit());
      void this.router.navigate([], { relativeTo: this.route, queryParams: { wahoo: null },
        queryParamsHandling: 'merge', replaceUrl: true });
    }
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      this.status = await firstValueFrom(this.inbox.connection());
      this.statusChange.emit(this.status);
      // The private inbox remains available after disconnecting the provider.
      this.ridesChange.emit(await firstValueFrom(this.inbox.rides()));
    } catch {
      if (!this.status) this.statusChange.emit({ available: false, connected: false, connectedAt: null });
      else this.error = 'syncFailed';
    } finally { this.refreshing = false; }
  }

  async connect(): Promise<void> {
    if (!this.status?.available || this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      const result = await firstValueFrom(this.inbox.authorize());
      const url = new URL(result.url);
      if (url.origin !== 'https://api.wahooligan.com' || url.pathname !== '/oauth/authorize') throw new Error('OAuth URL inesperada');
      window.location.assign(url.href);
    } catch { this.error = 'connectFailed'; this.busy = false; }
  }

  async disconnect(): Promise<void> {
    if (!window.confirm(this.t('confirmDisconnect'))) return;
    this.busy = true;
    this.error = null;
    try {
      await firstValueFrom(this.inbox.disconnect());
      this.message = 'disconnected';
      await this.refresh();
    } catch { this.error = 'disconnectFailed'; }
    finally { this.busy = false; }
  }

  async sync(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    this.message = null;
    try {
      const result = await firstValueFrom(this.inbox.sync());
      this.message = result.imported ? 'newActivities' : 'noNewActivities';
      await this.refresh();
    } catch (error) {
      const messages: Record<string, WahooTextKey> = {
        WAHOO_AUTHORIZATION_REQUIRED: 'reconnectRequired',
        WAHOO_ACCESS_DENIED: 'accessDenied',
        WAHOO_RATE_LIMITED: 'rateLimited',
        WAHOO_UNAVAILABLE: 'temporarilyUnavailable',
        WAHOO_REQUEST_REJECTED: 'requestRejected'
      };
      const code = error instanceof HttpErrorResponse ? error.error?.code : null;
      this.error = error instanceof HttpErrorResponse && error.status === 429 ? 'rateLimited'
        : Object.prototype.hasOwnProperty.call(messages, code) ? messages[code] : 'syncFailed';
    }
    finally { this.busy = false; }
  }
}
