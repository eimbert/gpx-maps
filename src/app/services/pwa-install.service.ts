import { Injectable, OnDestroy } from '@angular/core';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({ providedIn: 'root' })
export class PwaInstallService implements OnDestroy {
  private readonly storageKey = 'tracketeo.install-prompt.v1';
  private readonly standalone = window.matchMedia('(display-mode: standalone)');
  private deferredPrompt: InstallPromptEvent | null = null;
  private installed = false;
  private dismissedUntil = 0;
  busy = false;
  error = '';

  readonly isIos = /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  readonly isMobile = this.isIos || /Android/i.test(navigator.userAgent);

  constructor() {
    this.readPreference();
    if (this.isStandalone) this.markInstalled();
    window.addEventListener('beforeinstallprompt', this.onInstallPrompt);
    window.addEventListener('appinstalled', this.onInstalled);
    window.addEventListener('storage', this.onStorage);
    this.standalone.addEventListener('change', this.onDisplayModeChange);
  }

  get isStandalone(): boolean {
    return this.standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  }

  get canOffer(): boolean {
    return this.isMobile && !this.isStandalone && !this.installed
      && Date.now() >= this.dismissedUntil && (this.isIos || !!this.deferredPrompt || !!this.error || this.busy);
  }

  dismiss(): void {
    this.dismissedUntil = Date.now() + 30 * 24 * 60 * 60 * 1000;
    this.savePreference();
  }

  markInstalled(): void {
    this.installed = true;
    this.deferredPrompt = null;
    this.error = '';
    this.savePreference();
  }

  async install(): Promise<void> {
    const prompt = this.deferredPrompt;
    if (!prompt || this.busy || !this.canOffer) return;
    this.busy = true;
    this.error = '';
    // A browser prompt can only be used once, even if the user cancels it.
    this.deferredPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') this.markInstalled();
      else this.dismiss();
    } catch {
      this.error = 'No se ha podido abrir la instalación. Abre el menú del navegador y busca «Instalar aplicación» o «Añadir a pantalla de inicio».';
    } finally {
      this.busy = false;
    }
  }

  private readonly onInstallPrompt = (event: Event): void => {
    if (!this.isMobile) return;
    event.preventDefault();
    this.deferredPrompt = event as InstallPromptEvent;
    this.error = '';
  };
  private readonly onInstalled = (): void => this.markInstalled();
  private readonly onDisplayModeChange = (): void => {
    if (this.isStandalone) this.markInstalled();
  };
  private readonly onStorage = (event: StorageEvent): void => {
    if (event.key === this.storageKey || event.key === null) this.readPreference();
  };

  private readPreference(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
      this.installed = saved?.installed === true;
      this.dismissedUntil = Number.isFinite(saved?.dismissedUntil) ? saved.dismissedUntil : 0;
    } catch {
      // Storage can be unavailable in private browsing; in-memory state still works.
    }
  }

  private savePreference(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({ installed: this.installed, dismissedUntil: this.dismissedUntil }));
    } catch { /* Keep the choice for this session when storage is unavailable. */ }
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeinstallprompt', this.onInstallPrompt);
    window.removeEventListener('appinstalled', this.onInstalled);
    window.removeEventListener('storage', this.onStorage);
    this.standalone.removeEventListener('change', this.onDisplayModeChange);
  }
}
