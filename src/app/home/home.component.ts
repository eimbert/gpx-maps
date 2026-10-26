import { AfterViewChecked, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { LoginDialogComponent } from '../login-dialog/login-dialog.component';
import { LoginSuccessResponse } from '../interfaces/auth';
import { RegisterDialogComponent } from '../register-dialog/register-dialog.component';
import { AuthService, EntitlementsResponse } from '../services/auth.service';
import { catchError, forkJoin, of, Subscription } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { BillingPlan, BillingService, BillingStatusResponse } from '../services/billing.service';
import { LanguageService } from '../services/language.service';
import { homeTranslations, HomeTranslationKey } from './home-translations';
import { GarminInboxService } from '../garmin-sync/garmin-inbox.service';
import { WahooInboxService } from '../garmin-sync/wahoo-inbox.service';
import { PolarInboxService } from '../garmin-sync/polar-inbox.service';
import { EventService } from '../services/event.service';
import { EventTrack } from '../interfaces/events';
import { buildProfileVisual } from '../utils/profile-visual';
import { DashboardStateService } from '../services/dashboard-state.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css', './dashboard.css']
})
export class HomeComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('accountSection') private accountSection?: ElementRef<HTMLElement>;
  private scrollToAccountPending = false;
  loggedUser: LoginSuccessResponse | null = null;
  premiumDetailsOpen = false;
  usageDetailsOpen = false;
  entitlements: EntitlementsResponse | null = null;
  billingStatus: BillingStatusResponse | null = null;
  billingBusy: BillingPlan | 'portal' | null = null;
  billingMessage = '';
  inboxDeviceCount: number | null = null;
  inboxPendingCount = 0;
  dashboardTracks: EventTrack[] = [];
  dashboardProfiles: Record<number, string> = {};
  dashboardLoading = false;
  get accountOpen(): boolean { return this.dashboardState.accountOpen; }
  set accountOpen(value: boolean) {
    this.dashboardState.accountOpen = value;
    this.scrollToAccountPending = value;
  }
  get firstName(): string { return this.loggedUser?.name?.trim().split(/\s+/)[0] || ''; }
  get initials(): string { return (this.loggedUser?.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'TU'; }
  trackName(track: EventTrack): string { return track.title || track.fileName?.replace(/\.gpx$/i, '') || track.nickname || 'Ruta'; }
  openDashboardTrack(track: EventTrack): void { void this.router.navigate(['/load'], { queryParams: { mode: 'routes', view: 'archive', analysisTrackId: track.id } }); }
  analyzeDashboardTrack(track: EventTrack): void { void this.router.navigate(['/analysis'], { queryParams: { trackId: track.id, source: 'tracks', returnTo: '/' } }); }
  private checkoutPendingConfirmation = false;
  private sessionSub?: Subscription;

  constructor(
    private dialog: MatDialog,
    private authService: AuthService,
    private billingService: BillingService,
    private garminInbox: GarminInboxService,
    private polarInbox: PolarInboxService,
    private wahooInbox: WahooInboxService,
    private eventService: EventService,
    private dashboardState: DashboardStateService,
    private router: Router,
    private route: ActivatedRoute,
    public languageService: LanguageService
  ) {}

  t(key: HomeTranslationKey): string {
    return homeTranslations[this.languageService.current][key];
  }


  ngOnInit(): void {
    this.sessionSub = this.route.fragment.subscribe(fragment => this.accountOpen = fragment === 'account' || fragment === 'premium');
    const resetToken = this.route.snapshot.queryParamMap.get('token');
    if (this.route.snapshot.fragment === 'premium') this.premiumDetailsOpen = true;
    if (resetToken) {
      this.router.navigate(['/reset-password'], {
        queryParams: { token: resetToken },
        replaceUrl: true
      });
      return;
    }

    const checkoutResult = this.route.snapshot.queryParamMap.get('checkout');
    if (checkoutResult === 'success') {
      this.accountOpen = true;
      this.billingMessage = this.t('paymentConfirmed');
      this.checkoutPendingConfirmation = true;
      this.router.navigate([], { queryParams: { checkout: null, session_id: null }, queryParamsHandling: 'merge', replaceUrl: true });
    } else if (checkoutResult === 'cancelled') {
      this.accountOpen = true;
      this.billingMessage = this.t('paymentCancelled');
      this.router.navigate([], { queryParams: { checkout: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }

    this.loggedUser = this.authService.getSession();
    this.sessionSub.add(this.authService.sessionChanges$.subscribe(session => {
      this.loggedUser = session;
      if (session) this.loadAccountState();
      else { this.entitlements = null; this.billingStatus = null; this.inboxDeviceCount = null; this.inboxPendingCount = 0; this.dashboardTracks = []; this.dashboardProfiles = {}; this.dashboardState.routeCount = 0; this.dashboardState.pendingCount = 0; }
    }));

    this.authService.validateSessionWithBackend().subscribe(session => {
      this.loggedUser = session;
      if (session) this.loadAccountState();
      if (!session) {
        this.router.navigate(['/']);
      }
    });
  }

  ngOnDestroy(): void {
    this.sessionSub?.unsubscribe();
  }

  ngAfterViewChecked(): void {
    if (!this.scrollToAccountPending || !this.accountSection) return;
    this.scrollToAccountPending = false;
    const section = this.accountSection.nativeElement;
    requestAnimationFrame(() => {
      if (this.accountOpen && window.matchMedia('(max-width: 700px)').matches) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  openLoginDialog(): void {
    this.dialog.open<LoginDialogComponent, void, LoginSuccessResponse>(LoginDialogComponent, {
      width: '440px', panelClass: 'tracketeo-auth-dialog'
    }).afterClosed().subscribe(result => {
      if (result) {
        this.loggedUser = result;
      }
    });
  }

  openRegisterDialog(): void {
    this.dialog.open<RegisterDialogComponent, void, void>(RegisterDialogComponent, {
      width: '480px', panelClass: 'tracketeo-auth-dialog'
    });
  }

  logout(): void {
    this.authService.clearSession();
    this.loggedUser = null;
    this.entitlements = null;
    this.billingStatus = null;
    this.inboxDeviceCount = null;
    this.inboxPendingCount = 0;
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
    return limit < 0 ? this.t('unlimited') : `${Math.max(0, limit - used)} ${this.t('remaining')}`;
  }

  startCheckout(plan: BillingPlan, event?: Event): void {
    event?.stopPropagation();
    if (!this.loggedUser) {
      this.dialog.open<LoginDialogComponent, void, LoginSuccessResponse>(LoginDialogComponent, { width: '440px', panelClass: 'tracketeo-auth-dialog' })
        .afterClosed().subscribe(result => {
          if (result) { this.loggedUser = result; this.beginCheckout(plan); }
        });
      return;
    }
    this.beginCheckout(plan);
  }

  openBillingPortal(event?: Event): void {
    event?.stopPropagation();
    if (this.billingBusy) return;
    this.billingBusy = 'portal';
    this.billingMessage = '';
    this.billingService.createPortal().pipe(finalize(() => this.billingBusy = null)).subscribe({
      next: response => window.location.assign(response.url),
      error: error => this.billingMessage = this.billingError(error, this.t('billingPortalError'))
    });
  }

  private beginCheckout(plan: BillingPlan): void {
    if (this.billingBusy) return;
    this.billingBusy = plan;
    this.billingMessage = '';
    this.billingService.createCheckout(plan).pipe(finalize(() => this.billingBusy = null)).subscribe({
      next: response => window.location.assign(response.url),
      error: error => this.billingMessage = this.billingError(error, this.t('checkoutError'))
    });
  }

  private billingError(error: any, fallback: string): string {
    return error?.error?.detail || error?.error?.message || fallback;
  }

  private loadAccountState(): void {
    this.loadDashboardTracks();
    this.loadEntitlements();
    forkJoin({
      devices: this.garminInbox.devices().pipe(catchError(() => of([]))),
      rides: this.garminInbox.rides().pipe(catchError(() => of([]))),
      polar: this.polarInbox.connection().pipe(catchError(() => of(null))),
      polarRides: this.polarInbox.rides().pipe(catchError(() => of([]))),
      wahoo: this.wahooInbox.connection().pipe(catchError(() => of(null))),
      wahooRides: this.wahooInbox.rides().pipe(catchError(() => of([])))
    }).subscribe({
      next: ({ devices, rides, polar, polarRides, wahoo, wahooRides }) => {
        this.inboxDeviceCount = devices.length + (polar?.connected ? 1 : 0) + (wahoo?.connected ? 1 : 0);
        this.inboxPendingCount = rides.filter(ride => ride.inboxStatus === 'PENDING').length
          + polarRides.filter(ride => ride.status === 'PENDING').length
          + wahooRides.filter(ride => ride.status === 'PENDING').length;
        this.dashboardState.pendingCount = this.inboxPendingCount;
      },
      error: () => this.inboxDeviceCount = null
    });
    this.billingService.getStatus().subscribe({
      next: status => {
        this.billingStatus = status;
        if (this.checkoutPendingConfirmation && status.premium) {
          this.billingMessage = this.t('subscriptionConfirmed');
          this.checkoutPendingConfirmation = false;
          this.loadEntitlements();
        }
      },
      error: () => this.billingStatus = null
    });
  }

  private loadEntitlements(): void {
    this.authService.getEntitlements().subscribe({
      next: entitlements => this.entitlements = entitlements,
      error: () => this.entitlements = null
    });
  }

  private loadDashboardTracks(): void {
    const userId = this.loggedUser?.id;
    this.dashboardLoading = true;
    this.eventService.getMyTracks(false).pipe(catchError(() => of([]))).subscribe(tracks => {
      if (this.loggedUser?.id !== userId) return;
      this.dashboardState.routeCount = tracks.length;
      this.dashboardTracks = [...tracks].sort((a, b) => (Date.parse(b.uploadedAt) || 0) - (Date.parse(a.uploadedAt) || 0)).slice(0, 3);
      this.dashboardLoading = false;
      for (const track of this.dashboardTracks) {
        this.eventService.getTrackGpx(track.id).pipe(catchError(() => of(null))).subscribe(file => {
          if (!file?.routeXml || this.loggedUser?.id !== userId) return;
          const xml = new DOMParser().parseFromString(file.routeXml, 'application/xml');
          const points = Array.from(xml.querySelectorAll('trkpt, rtept')).filter(point => !!point.querySelector('ele')).map(point => ({ lat: Number(point.getAttribute('lat')), lon: Number(point.getAttribute('lon')), ele: Number(point.querySelector('ele')?.textContent) })).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon) && Number.isFinite(point.ele));
          const profile = buildProfileVisual(points, 640, 130);
          if (profile) this.dashboardProfiles[track.id] = profile.points;
        });
      }
    });
  }
}
