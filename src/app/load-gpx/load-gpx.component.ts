import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DashboardStateService } from '../services/dashboard-state.service';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom, Subject, Subscription, from } from 'rxjs';
import { auditTime, exhaustMap, filter, takeUntil } from 'rxjs/operators';

import { DialogoConfiguracionComponent } from '../dialogo-configuracion/dialogo-configuracion.component';
import { DialogoConfiguracionData } from '../interfaces/estructuras';
import { TrackMetadataDialogComponent, TrackMetadataDialogData, TrackMetadataDialogResult } from '../track-metadata-dialog/track-metadata-dialog.component';
import { RouteMismatchDialogComponent } from '../route-mismatch-dialog/route-mismatch-dialog.component';
import { EventSearchDialogComponent, EventSearchDialogData, EventSearchDialogResult } from '../event-search-dialog/event-search-dialog.component';
import { ProfileVisual, TrackPointWithElevation, buildProfileVisual } from '../utils/profile-visual';
import {
  BikeType,
  CreateEventPayload,
  CreateTrackPayload,
  EventTrack,
  RaceCategory,
  RaceEvent,
  RouteTrackTime,
  TrackGpxFile
} from '../interfaces/events';
import { EventService } from '../services/event.service';
import { EventCreateDialogComponent, EventCreateDialogResult } from '../event-create-dialog/event-create-dialog.component';
import { EventTrackUploadDialogComponent, EventTrackUploadDialogData, EventTrackUploadDialogResult } from '../event-track-upload-dialog/event-track-upload-dialog.component';
import { UserIdentityService } from '../services/user-identity.service';
import { LoginDialogComponent } from '../login-dialog/login-dialog.component';
import { RegisterDialogComponent } from '../register-dialog/register-dialog.component';
import { AuthService } from '../services/auth.service';
import { InfoMessageService } from '../services/info-message.service';
import { InfoDialogComponent, InfoDialogData, InfoDialogResult } from '../info-dialog/info-dialog.component';
import { StandaloneTrackUploadDialogComponent, StandaloneTrackUploadResult } from '../standalone-track-upload-dialog/standalone-track-upload-dialog.component';
import { PlanService, PlanTrackImportPayload } from '../services/plan.service';
import { PlanTrackDialogComponent, PlanTrackDialogData, PlanTrackDialogResult } from '../plan-track-dialog/plan-track-dialog.component';
import { MapPayloadTransferService } from '../services/map-payload-transfer.service';
import { environment } from 'src/environments/environment';
import { PublicRouteAnalysis } from '../interfaces/route-analysis';
import { RouteAnalysisService } from '../services/route-analysis.service';
import { calculateGpxElevation, ElevationResult } from '../utils/gpx-elevation';
import { RouteWorkspaceStateService } from '../services/route-workspace-state.service';
import { ProximityOrigin } from '../utils/proximity-origin';
import { ProximityOriginChoice, ProximityOriginDialogComponent } from '../proximity-origin-dialog/proximity-origin-dialog.component';
import { selectedUiText } from '../services/screen-texts';
import { AppLanguage, LanguageService } from '../services/language.service';

interface TrackPoint {
  lat: number;
  lon: number;
  ele: number;
  time: string;
  hr: number | null;
  segment?: number;
}

interface LoadedTrack {
  name: string;
  color: string;
  fileName: string;
  details: { date: string; distance: number; ascent: number; elevationStatus: ElevationResult['status']; elevationQuality: ElevationResult['quality'] };
  data: { elevations: number[]; trkpts: TrackPoint[]; routeXml?: string };
}

interface ParsedTrackResult {
  track: LoadedTrack;
  durationSeconds: number;
}

interface EventVisuals {
  profile: ProfileVisual | null;
  trackPath: string | null;
  mapTileUrl: string | null;
}

interface EventTrackUploadDraft {
  eventId: number | null;
  category: RaceCategory;
  bikeType: BikeType;
  file: File | null;
}

interface EventTrackUploadPayload {
  eventId: number;
  category: RaceCategory;
  bikeType: BikeType;
  file: File;
}

type TrackLocationDetails = {
  population: string | null;
  autonomousCommunity: string | null;
  comarca: string | null;
  province: string | null;
};

type TrackLocationInfo = TrackLocationDetails & {
  startLatitude: number | null;
  startLongitude: number | null;
};

interface UserTrackRow {
  trackId: number;
  routeId: number | null;
  nickname: string | null;
  bikeType: BikeType | null;
  eventName: string;
  year: number;
  autonomousCommunity: string | null;
  comarca: string | null;
  province: string | null;
  population: string | null;
  startLat?: number | null;
  startLon?: number | null;
  distanceKm: number;
  ascentMeters: number | null;
  elevationQuality?: ElevationResult['quality'];
  timeSeconds: number;
  totalTimeSeconds: number;
  distanceLabel: string;
  movingTimeLabel: string;
  totalTimeLabel: string;
  difficultyScore: number | null;
  difficultyLevel: number | null;
  difficultyVersion: number | null;
  gpxData?: string | null;
  gpxAsset?: string | null;
  fileName?: string | null;
  canDelete: boolean;
  googleMapsLink: string;
  title?: string | null;
  description?: string | null;
  proximityMeters?: number | null;
  proximityRank?: number | null;
  proximityRoadDurationS?: number | null;
}

type PlanningTrackRow = Pick<UserTrackRow,
  'trackId' | 'title' | 'eventName' | 'fileName' | 'gpxData' | 'gpxAsset' |
  'distanceKm' | 'timeSeconds' | 'totalTimeSeconds' | 'startLat' | 'startLon' | 'population'>;

interface ProximityMatrixCandidate {
  trackId: number;
  startLat: number;
  startLon: number;
  haversineKm: number;
}

interface ProximityMatrixRequest {
  profile: 'driving-car';
  origin: { lat: number; lon: number };
  candidates: ProximityMatrixCandidate[];
  options: {
    metrics: Array<'duration' | 'distance'>;
    units: 'm';
    resolveOrderBy: 'duration';
    fallback: 'haversine';
  };
}

interface ProximityMatrixResponse {
  strategyUsed: 'matrix' | 'haversine';
  ordered: Array<{
    trackId: number;
    rank: number;
    roadDistanceM: number | null;
    roadDurationS: number | null;
  }>;
}

type UserTrackDifficulty = {
  key: 'easy' | 'medium' | 'hard' | 'very-hard' | 'unknown';
  label: string;
  description: string;
};

type UserTracksSortColumn =
  | 'year'
  | 'province'
  | 'comarca'
  | 'population'
  | 'autonomousCommunity'
  | 'distanceKm'
  | 'timeSeconds'
  | 'totalTimeSeconds'
  | 'proximityMeters';
type SortDirection = 'asc' | 'desc';
type UserTracksTab = 'personal' | 'events' | 'analyses' | 'shared';
type UserTracksGroupBy = 'autonomousCommunity' | 'province' | 'comarca' | 'population' | 'proximity';

interface TrackTableState {
  sortColumn: UserTracksSortColumn;
  sortDirection: SortDirection;
  groupBy: UserTracksGroupBy;
  filter: string;
  rows: number;
  page: number;
}

interface GroupedUserTracks {
  province: string;
  autonomousCommunity: string | null;
  routes: UserTrackRow[];
  count: number;
}

interface UserTracksDerivedData {
  sorted: UserTrackRow[];
  filtered: UserTrackRow[];
  grouped: GroupedUserTracks[];
}

interface WorkspaceSnapshot {
  tab: UserTracksTab;
  tables: Record<UserTracksTab, TrackTableState>;
  expanded: Record<UserTracksTab, string[]>;
  destination: string | null;
  scroll: number;
  listScroll: number;
  origins: Partial<Record<UserTracksTab, ProximityOrigin>>;
  proximity: Record<string, Pick<UserTrackRow, 'proximityMeters' | 'proximityRank' | 'proximityRoadDurationS'>>;
  animationType: 'descubrir' | 'carrera' | null;
  tracks: LoadedTrack[];
  archiveReturn: 'archive' | 'picker' | null;
}

@Component({
  selector: 'app-load-gpx',
  templateUrl: './load-gpx.component.html',
  styleUrls: ['./load-gpx.component.css', './archive-design.css', './animation-design.css']
})
export class LoadGpxComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('masterGpxInput') masterGpxInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('userTracksSection') userTracksSectionRef?: ElementRef<HTMLElement>;
  @ViewChild('publicAnalysisDetail') publicAnalysisDetailRef?: ElementRef<HTMLElement>;

  readonly maxTracks = 4;
  readonly maxComparison = 3;
  private readonly overlapThreshold = 0.65;
  private readonly overlapProximityMeters = 150;

  isDragOver = false;
  tracks: LoadedTrack[] = [];
  isAuthenticated = false;
  private sessionSub?: Subscription;
  private eventsNoticeShown = false;

  readonly userTrackDifficultyLegend: UserTrackDifficulty[] = [
    { key: 'easy', label: selectedUiText('soft'), description: selectedUiText('difficultyEasyHelp') },
    { key: 'medium', label: selectedUiText('mediumDifficulty'), description: selectedUiText('difficultyMediumHelp') },
    { key: 'hard', label: selectedUiText('hardDifficulty'), description: selectedUiText('difficultyHardHelp') },
    { key: 'very-hard', label: selectedUiText('veryHard'), description: selectedUiText('difficultyVeryHardHelp') },
    { key: 'unknown', label: selectedUiText('noData'), description: selectedUiText('difficultyUnknownHelp') }
  ];

  routeView: 'archive' | 'animate' = 'animate';
  animationType: 'descubrir' | 'carrera' | null = null;
  choosingFromArchive = false;
  loadingAnimationTrackId: number | null = null;
  private archiveReturn: 'archive' | 'picker' | null = null;
  private archiveScroll = 0;
  private destinationListScroll = 0;
  private restorePositionTimer?: ReturnType<typeof setTimeout>;
  private pendingArchiveRestore = false;
  private savedDestination: string | null = null;
  private proximityOrigins: Partial<Record<UserTracksTab, ProximityOrigin>> = {};
  private proximityMetrics: WorkspaceSnapshot['proximity'] = {};

  mode: 'routes' | 'events' = 'routes';
  events: RaceEvent[] = [];
  selectedEventId: number | null = null;
  selectedModalityId: number | null = null;
  carouselIndex = 0;
  private carouselTimer?: ReturnType<typeof setInterval>;
  private readonly carouselIntervalMs = 9000;
  private eventsLoadedForUserId: number | null = null;
  isCarouselPaused = false;

  selectedComparisonIds = new Set<number>();
  latestUploadedTrackId: number | null = null;
  personalNickname = '';
  personalHistory: EventTrack[] = [];
  routeTrackTimes: RouteTrackTime[] = [];
  selectedRankingCategory = 'all';
  eventVisuals: Record<number, EventVisuals> = {};

  readonly profileWidth = 240;
  readonly profileHeight = 80;

  private pendingMasterUploadEventId: number | null = null;

  userTracksLoading = false;
  sharedTracksLoading = false;
  publicAnalysesLoading = false;
  publicAnalysesError: string | null = null;
  publicSharedTrackCount = 0;
  private publicSharedTrackCountRequested = false;
  recentPublicAnalyses: PublicRouteAnalysis[] = [];
  publicAnalyses: PublicRouteAnalysis[] = [];
  selectedPublicAnalysis: PublicRouteAnalysis | null = null;
  openingAnalysisTrackId: number | null = null;
  planningAnalysisTrackId: number | null = null;
  selectedDestination: GroupedUserTracks | null = null;
  private readonly destinationDescriptions = new Map<string, string>();
  destinationDescriptionLoading = false;
  refreshingPlaceDescriptionKey: string | null = null;

  private readonly userTrackRows: Record<UserTracksTab, UserTrackRow[]> = {
    personal: [],
    events: [],
    analyses: [],
    shared: []
  };

  private readonly userTracksDerived: Record<UserTracksTab, UserTracksDerivedData> = {
    personal: { sorted: [], filtered: [], grouped: [] },
    events: { sorted: [], filtered: [], grouped: [] },
    analyses: { sorted: [], filtered: [], grouped: [] },
    shared: { sorted: [], filtered: [], grouped: [] }
  };

  private readonly userTracksDataVersion: Record<UserTracksTab, number> = {
    personal: 0,
    events: 0,
    analyses: 0,
    shared: 0
  };

  private readonly userTracksStateVersion: Record<UserTracksTab, number> = {
    personal: 0,
    events: 0,
    analyses: 0,
    shared: 0
  };

  private readonly userTracksDerivedVersion: Record<UserTracksTab, { data: number; state: number }> = {
    personal: { data: -1, state: -1 },
    events: { data: -1, state: -1 },
    analyses: { data: -1, state: -1 },
    shared: { data: -1, state: -1 }
  };

  private readonly tableState: Record<UserTracksTab, TrackTableState> = {
    personal: { sortColumn: 'year', sortDirection: 'asc', groupBy: 'province', filter: '', rows: 10, page: 0 },
    events: { sortColumn: 'year', sortDirection: 'asc', groupBy: 'province', filter: '', rows: 10, page: 0 },
    analyses: { sortColumn: 'year', sortDirection: 'desc', groupBy: 'province', filter: '', rows: 10, page: 0 },
    shared: { sortColumn: 'year', sortDirection: 'asc', groupBy: 'province', filter: '', rows: 10, page: 0 }
  };
  readonly groupingSelectionMade: Record<UserTracksTab, boolean> = {
    personal: false, events: false, analyses: false, shared: false
  };

  readonly userTracksRowsOptions = [10, 25, 50];
  get userTracksGroupByOptions(): { value: UserTracksGroupBy; label: string; pluralLabel: string }[] { return [
    { value: 'province', label: selectedUiText('province'), pluralLabel: selectedUiText('provinces') },
    { value: 'autonomousCommunity', label: selectedUiText('community'), pluralLabel: selectedUiText('communities') },
    { value: 'comarca', label: selectedUiText('county'), pluralLabel: selectedUiText('counties') },
    { value: 'population', label: selectedUiText('population'), pluralLabel: selectedUiText('towns') },
    { value: 'proximity', label: selectedUiText('proximity'), pluralLabel: selectedUiText('tracksSection') }
  ]; }
  activeUserTracksTab: UserTracksTab = 'personal';

  trackGroupingOption(_index: number, option: { value: UserTracksGroupBy }): UserTracksGroupBy {
    return option.value;
  }

  private readonly expandedProvinces: Record<UserTracksTab, Set<string>> = {
    personal: new Set<string>(),
    events: new Set<string>(),
    analyses: new Set<string>(),
    shared: new Set<string>()
  };

  private readonly downloadingTracks = new Set<number>();
  private readonly deletingTracks = new Set<number>();
  private readonly planningTracks = new Set<number>();
  private readonly downloadingMasterTracks = new Set<number>();
  private readonly proximityLoadingTabs = new Set<UserTracksTab>();

  standaloneUploadInProgress = false;
  recentlyAddedTrackId: number | null = null;

  private sessionExpiredNotified = false;

  hoveredUserTrack: any | null = null;
  private readonly isMobileViewport =
    typeof window !== 'undefined' &&
    (window.matchMedia('(max-width: 1024px)').matches || window.matchMedia('(pointer: coarse)').matches);
  isUserTracksPanelCollapsed = false;
  isEventRankingPanelCollapsed = false;

  eventUpload: EventTrackUploadDraft = {
    eventId: null,
    category: 'Senior M' as RaceCategory,
    bikeType: 'MTB' as BikeType,
    file: null
  };

  categories: RaceCategory[] = [
    'Sub 23M',
    'Sub 23F',
    'Senior M',
    'Senior F',
    'Master 40M',
    'Master 40F',
    'Master 50M',
    'Master 50F',
    'Master 60M',
    'Master 60F'
  ];
  bikeTypes: BikeType[] = ['MTB', 'Carretera', 'Gravel', 'e-Bike'];
  private readonly userId: number;

  // ====== Eventos precalculados + cache geocoding ======
  private eventsById = new Map<number, RaceEvent>();

  private geoCache = new Map<string, TrackLocationDetails>();

  // ====== Orquestación refresh + no-reentrante ======
  private destroy$ = new Subject<void>();
  private refreshRequest$ = new Subject<void>();
  private refreshInFlight?: Promise<void>;
  private refreshAgainRequested = false;

  constructor(
    public dialog: MatDialog,
    private router: Router,
    private route: ActivatedRoute,
    private eventService: EventService,
    private http: HttpClient,
    private authService: AuthService,
    public dashboardState: DashboardStateService,
    private infoMessageService: InfoMessageService,
    private planService: PlanService,
    private mapPayloadTransfer: MapPayloadTransferService,
    private routeAnalysisService: RouteAnalysisService,
    private workspaceState: RouteWorkspaceStateService,
    private languageService: LanguageService,
    identityService: UserIdentityService
  ) {
    this.userId = identityService.getUserId();
  }

  private openInfoDialog(data: InfoDialogData): Promise<InfoDialogResult | undefined> {
    const dialogRef = this.dialog.open<InfoDialogComponent, InfoDialogData, InfoDialogResult>(InfoDialogComponent, {
      width: '420px',
      panelClass: 'tracketeo-message-dialog',
      data
    });

    return firstValueFrom(dialogRef.afterClosed());
  }

  get archiveInitials(): string {
    return (this.authService.getSession()?.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'TU';
  }

  private showMessage(message: string, title = selectedUiText('noticeTitle')): void {
    this.infoMessageService.showMessage({
      title,
      message
    });
  }

  ngOnInit(): void {
    const hadStoredSession = !!this.authService.getSession();

    this.applyInitialMode();
    this.restoreWorkspaceState();
    this.restoreGroupingPreferences();
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.routeView = params.get('view') === 'archive' ? 'archive' : 'animate';
      this.choosingFromArchive = params.get('picker') === '1';
      if (this.routeView === 'archive' || this.choosingFromArchive) this.restoreArchivePosition();
    });

    this.isAuthenticated = this.authService.isAuthenticated();
    this.personalNickname = this.authService.getSession()?.nickname ?? '';

    // ÚNICO sitio donde se ejecuta el refresh REAL
    this.refreshRequest$
      .pipe(
        auditTime(0),
        filter(() => this.isAuthenticated),
        exhaustMap(() => from(this.refreshUserTracks())),
        takeUntil(this.destroy$)
      )
      .subscribe();

    // Cambios de sesión
    this.sessionSub = this.authService.sessionChanges$
      .pipe(takeUntil(this.destroy$))
      .subscribe(session => {
        this.isAuthenticated = !!session;
        this.personalNickname = session?.nickname ?? '';

        if (session) {
          this.sessionExpiredNotified = false;
          this.loadPublicAnalyses();
          if (this.eventsLoadedForUserId !== session.id) {
            this.eventsLoadedForUserId = session.id;
            this.eventService.refreshEvents().pipe(takeUntil(this.destroy$)).subscribe();
          }
        } else {
          this.eventsLoadedForUserId = null;
          this.eventService.clearEvents();
          this.loadPublicSharedTrackCount();
        }

        if (!this.isAuthenticated && this.mode === 'events') {
          this.showEventsAuthNotice();
        }

        if (!this.isAuthenticated) {
          this.workspaceState.clear();
          this.proximityOrigins = {};
          this.proximityMetrics = {};
          this.savedDestination = null;
          this.selectedDestination = null;
          this.resetUserTrackRows();
          this.userTracksLoading = false;
          this.sharedTracksLoading = false;
        } else {
          this.requestRefreshUserTracks();
        }
      });

    // Validación con backend (puede provocar sessionChanges$ también)
    this.authService
      .validateSessionWithBackend()
      .pipe(takeUntil(this.destroy$))
      .subscribe(session => {
        this.isAuthenticated = !!session;
        this.personalNickname = session?.nickname ?? '';

        if (!this.isAuthenticated && hadStoredSession) {
          this.handleSessionExpired();
        }

        if (!this.isAuthenticated && this.mode === 'events') {
          this.showEventsAuthNotice();
        }

        if (this.isAuthenticated) {
          this.loadPublicAnalyses();
          this.requestRefreshUserTracks();
        }
      });

    // Eventos
    this.eventService
      .getEvents()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: events => {
          this.events = events;

          // precalcula el Map una vez (y reutilízalo en refreshUserTracks)
          this.eventsById = new Map<number, RaceEvent>(events.map(e => [e.id, e]));

          this.syncCarouselIndex();
          this.syncSelectionWithCarousel();
          this.restartCarouselTimer();
          void this.buildEventVisuals(events);

          if (this.isAuthenticated) {
            this.requestRefreshUserTracks();
          }
        },
        error: () => {
          this.events = [];
          this.eventsById = new Map<number, RaceEvent>();
          this.eventVisuals = {};
        }
      });
  }

  ngOnDestroy(): void {
    this.saveWorkspaceState();
    clearTimeout(this.restorePositionTimer);
    this.clearCarouselTimer();

    this.destroy$.next();
    this.destroy$.complete();

    this.sessionSub?.unsubscribe();
  }

  private requestRefreshUserTracks(): void {
    if (this.refreshInFlight) {
      this.refreshAgainRequested = true;
      return;
    }
    this.refreshRequest$.next();
  }

  get selectedEvent(): RaceEvent | undefined {
    return this.events.find(e => e.id === this.selectedEventId);
  }

  private applyInitialMode(): void {
    // Los enlaces antiguos a eventos vuelven al archivo y la animación normales.
    this.mode = 'routes';
  }

  setRouteView(view: 'archive' | 'animate'): void {
    if (this.routeView === 'archive' || this.choosingFromArchive) this.rememberArchivePosition();
    this.routeView = view;
    this.choosingFromArchive = false;
    if (view === 'animate') document.querySelector('.route-workspace')?.scrollTo({ top: 0, behavior: 'auto' });
    void this.router.navigate([], { relativeTo: this.route, queryParams: { view, picker: null }, queryParamsHandling: 'merge' });
  }

  selectAnimationType(type: 'descubrir' | 'carrera'): void {
    this.animationType = type;
    this.choosingFromArchive = false;
    if (type === 'descubrir' && this.tracks.length > 1) {
      this.tracks = this.tracks.slice(0, 1);
      this.showMessage('Descubrir ruta usa un solo GPX. Se ha conservado el primer track seleccionado.');
    }
  }

  openAnimationArchive(): void {
    this.choosingFromArchive = true;
    if (this.activeUserTracksTab === 'analyses') this.setUserTracksTab('personal');
    void this.router.navigate([], { relativeTo: this.route, queryParams: { view: 'animate', picker: '1' }, queryParamsHandling: 'merge' });
  }

  goBack(): void {
    if (this.routeView === 'archive' || this.choosingFromArchive) {
      if (this.selectedDestination) { this.closeDestination(); return; }
      if (this.choosingFromArchive) { this.setRouteView('animate'); return; }
    } else if (this.archiveReturn) {
      if (this.archiveReturn === 'picker') this.openAnimationArchive();
      else this.setRouteView('archive');
      return;
    } else if (this.animationType) {
      this.animationType = null;
      return;
    }
    void this.router.navigate(['/']);
  }

  private rememberArchivePosition(): void {
    this.archiveScroll = document.querySelector('.route-workspace')?.scrollTop ?? 0;
    this.savedDestination = this.selectedDestination?.province ?? null;
  }

  private saveWorkspaceState(): void {
    if ((this.routeView === 'archive' || this.choosingFromArchive) && !this.activeTracksLoading && !this.pendingArchiveRestore) this.rememberArchivePosition();
    const tabs = Object.keys(this.tableState) as UserTracksTab[];
    const tables = {} as WorkspaceSnapshot['tables'];
    const expanded = {} as WorkspaceSnapshot['expanded'];
    tabs.forEach(tab => {
      tables[tab] = { ...this.tableState[tab] };
      expanded[tab] = [...this.expandedProvinces[tab]];
      this.userTrackRows[tab].forEach(row => {
        this.proximityMetrics[`${tab}:${row.trackId}`] = {
          proximityMeters: row.proximityMeters, proximityRank: row.proximityRank,
          proximityRoadDurationS: row.proximityRoadDurationS
        };
      });
    });
    this.workspaceState.save<WorkspaceSnapshot>(this.authService.getSession()?.id ?? null, {
      tab: this.activeUserTracksTab, tables, expanded, destination: this.savedDestination,
      scroll: this.archiveScroll, listScroll: this.destinationListScroll, origins: this.proximityOrigins, proximity: this.proximityMetrics,
      animationType: this.animationType, tracks: this.tracks, archiveReturn: this.archiveReturn
    });
  }

  private restoreWorkspaceState(): void {
    const saved = this.workspaceState.read<WorkspaceSnapshot>(this.authService.getSession()?.id ?? null);
    if (!saved) return;
    // Las preferencias guardadas antes de retirar eventos deben abrir el archivo propio.
    this.activeUserTracksTab = saved.tab === 'events' ? 'personal' : saved.tab;
    (Object.keys(saved.tables) as UserTracksTab[]).forEach(tab => {
      Object.assign(this.tableState[tab], saved.tables[tab]);
      this.expandedProvinces[tab] = new Set(saved.expanded[tab]);
    });
    this.savedDestination = saved.destination;
    this.archiveScroll = saved.scroll;
    this.destinationListScroll = saved.listScroll;
    this.proximityOrigins = saved.origins;
    this.proximityMetrics = saved.proximity;
    this.animationType = saved.animationType;
    this.tracks = saved.tracks;
    this.archiveReturn = saved.archiveReturn;
    this.pendingArchiveRestore = true;
  }

  private restoreArchivePosition(): void {
    if (this.routeView !== 'archive' && !this.choosingFromArchive) return;
    if (this.activeTracksLoading || !this.getUserTrackRows(this.activeUserTracksTab).length) return;
    if (this.savedDestination) {
      this.selectedDestination = this.groupedUserTracks.find(group => group.province === this.savedDestination) ?? null;
      if (this.selectedDestination) this.resolveDestinationDescription(this.selectedDestination);
    }
    const top = this.archiveScroll;
    clearTimeout(this.restorePositionTimer);
    this.restorePositionTimer = setTimeout(() => {
      if (this.activeTracksLoading || (this.routeView !== 'archive' && !this.choosingFromArchive)) return;
      document.querySelector('.route-workspace')?.scrollTo({ top, behavior: 'auto' });
      this.pendingArchiveRestore = false;
    });
  }

  private workspaceReturnUrl(): string {
    const picker = this.choosingFromArchive || (this.routeView !== 'archive' && this.archiveReturn === 'picker');
    const view = !picker && (this.routeView === 'archive' || this.archiveReturn === 'archive') ? 'archive' : 'animate';
    return this.router.createUrlTree(['/load'], { queryParams: { mode: this.mode, view, picker: picker ? '1' : null } }).toString();
  }

  openArchiveLogin(): void {
    this.dialog.open(LoginDialogComponent, { width: '420px', maxWidth: '95vw', panelClass: 'tracketeo-auth-dialog' });
  }

  openArchiveRegister(): void {
    this.dialog.open(RegisterDialogComponent, { width: '480px', maxWidth: '95vw', panelClass: 'tracketeo-auth-dialog' });
  }

  private loadPublicSharedTrackCount(): void {
    if (this.publicSharedTrackCountRequested) return;
    this.publicSharedTrackCountRequested = true;
    this.eventService.getPublicSharedTrackCount()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: count => { this.publicSharedTrackCount = Math.max(0, Math.trunc(Number(count) || 0)); },
        error: () => { this.publicSharedTrackCount = 0; }
      });
  }

  private async openArchiveUploadInvitation(): Promise<void> {
    const choice = await this.openInfoDialog({
      title: 'Empieza tu archivo de rutas',
      message: 'Crea una cuenta gratis para guardar tus GPX y organizar hasta 25 tracks en tu archivo.',
      confirmLabel: selectedUiText('createFreeAccount'),
      cancelLabel: selectedUiText('notNow')
    });
    if (choice === 'confirm') this.openArchiveRegister();
  }

  selectMode(mode: 'routes' | 'events'): void {
    this.mode = mode;
    this.restoreMobileAnimationPanels();
  }

  private restoreMobileAnimationPanels(): void {
    this.isUserTracksPanelCollapsed = false;
    this.isEventRankingPanelCollapsed = false;
  }

  private async collapseMobilePanelBeforeAnimation(panel: 'routes' | 'events'): Promise<void> {
    if (!this.isMobileViewport) return;

    if (panel === 'routes') {
      this.isUserTracksPanelCollapsed = true;
    } else {
      this.isEventRankingPanelCollapsed = true;
    }

    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
  }

  selectEvent(eventId: number, modalityId?: number): void {
    this.selectedEventId = eventId;
    this.eventUpload.eventId = eventId;
    const event = this.selectedEvent;
    this.carouselIndex = Math.max(0, this.events.findIndex(e => e.id === eventId));
    this.selectedComparisonIds.clear();
    if (event?.tracks?.length) {
      event.tracks.slice(0, 3).forEach(track => this.selectedComparisonIds.add(track.id));
    }
    this.selectedModalityId = modalityId ?? event?.modalities?.[0]?.id ?? null;
    if (this.personalNickname) {
      this.refreshPersonalHistory();
    }
    this.loadRouteTrackTimes(eventId);
  }

  handleEventSelection(eventId: number | null): void {
    if (!eventId) {
      this.selectedEventId = null;
      this.selectedModalityId = null;
      this.selectedComparisonIds.clear();
      this.personalHistory = [];
      this.routeTrackTimes = [];
      this.eventUpload = { ...this.eventUpload, eventId: null };
      return;
    }

    this.selectEvent(eventId);
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  scrollToRouteArchive(tab: UserTracksTab): void {
    this.setUserTracksTab(tab);
    setTimeout(() => {
      document.getElementById('routeArchive')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  private notifyMultiTrackRequiresAuth(): void {
    void this.openInfoDialog({
      title: 'Acceso limitado',
      message:
        'Solo los usuarios registrados pueden cargar más de un GPX a la vez. Ve a la pantalla principal para iniciar sesión o registrarte.',
      confirmLabel: 'Ir a inicio',
      cancelLabel: 'Seguir aquí'
    }).then(result => {
      if (result === 'confirm') {
        this.router.navigate(['/']);
      }
    });
  }

  private handleSessionExpired(): void {
    if (this.sessionExpiredNotified) return;
    this.sessionExpiredNotified = true;
    this.showMessage(
      'Tu sesión ha expirado. Inicia sesión de nuevo para seguir disfrutando de todas las funciones.',
      'Sesión expirada'
    );
  }

  private showEventsAuthNotice(): void {
    if (this.eventsNoticeShown) return;
    this.eventsNoticeShown = true;
    void this.openInfoDialog({
      title: 'Inicia sesión para participar',
      message:
        'Puedes explorar y animar los eventos sin registrarte. Para subir, crear o gestionar tracks inicia sesión desde la pantalla principal.',
      confirmLabel: selectedUiText('understood')
    });
  }

  private ensureEventsAccess(): boolean {
    if (this.isAuthenticated) return true;
    this.showEventsAuthNotice();
    return false;
  }

  getEventLocation(event: RaceEvent): string {
    const parts = [event.population, event.autonomousCommunity].filter(Boolean);
    return parts.join(' • ');
  }

  getEventExternalUrl(event: RaceEvent): string | null {
    return this.normalizeExternalUrl(event.eventUrl ?? null);
  }

  private normalizeExternalUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
      const parsedUrl = new URL(candidate);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return null;
      }
      return parsedUrl.toString();
    } catch {
      return null;
    }
  }

  getEventLogoBg(event: any): string {
    const raw = event?.logoBlob;
    if (!raw) return 'none';

    const dataUrl = raw.startsWith('data:image/') ? raw : `data:image/png;base64,${raw.replace(/\s/g, '')}`;

    return `url("${dataUrl}")`;
  }

  getEventLogo(event: RaceEvent): string {
    if (event.logoBlob) {
      if (event.logoBlob.startsWith('data:image/')) return event.logoBlob;
      return this.buildDataUrl(event.logoBlob, event.logoMime || 'image/jpeg');
    }
    return 'assets/no-image.svg';
  }

  private buildDataUrl(content: string, mime = 'image/png'): string {
    return `data:${mime};base64,${(content || '').replace(/\s/g, '')}`;
  }

  private async buildEventVisuals(events: RaceEvent[]): Promise<void> {
    for (const event of events) {
      await this.prepareEventVisuals(event);
    }
  }

  private updateEventVisuals(eventId: number, visuals: EventVisuals): void {
    this.eventVisuals = { ...this.eventVisuals, [eventId]: visuals };
  }

  private async prepareEventVisuals(event: RaceEvent): Promise<void> {
    const gpxData = await this.resolveMasterGpxContent(event);
    if (!gpxData) {
      this.updateEventVisuals(event.id, { profile: null, trackPath: null, mapTileUrl: null });
      return;
    }

    const points = this.parseTrackPointsFromString(gpxData);
    if (!points.length) {
      this.updateEventVisuals(event.id, { profile: null, trackPath: null, mapTileUrl: null });
      return;
    }

    const profile = buildProfileVisual(points as TrackPointWithElevation[], this.profileWidth, this.profileHeight);
    const trackPath = this.buildTrackPolyline(points);
    const mapTileUrl = this.buildStaticTileUrl(points);
    this.updateEventVisuals(event.id, { profile, trackPath, mapTileUrl });
  }

  private async resolveMasterGpxContent(event: RaceEvent): Promise<string | null> {
    const decodedMaster = this.decodeGpxContent(event.gpxMaster);
    if (decodedMaster && this.isValidGpxData(decodedMaster)) {
      return decodedMaster;
    }

    const firstTrack = event.tracks?.[0];
    if (firstTrack?.gpxData && this.isValidGpxData(firstTrack.gpxData)) {
      return firstTrack.gpxData;
    }
    if (firstTrack?.gpxAsset) {
      try {
        const data = await firstValueFrom(this.http.get(firstTrack.gpxAsset, { responseType: 'text' }));
        if (this.isValidGpxData(data)) return data;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  private decodeGpxContent(raw?: string | null): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed.includes('<')) return trimmed;
    const base64 = trimmed.startsWith('data:') ? trimmed.split(',')[1] ?? '' : trimmed;
    try {
      return decodeURIComponent(escape(atob(base64.replace(/\s/g, ''))));
    } catch {
      try {
        return atob(base64.replace(/\s/g, ''));
      } catch {
        return null;
      }
    }
  }

  private parseTrackPointsFromString(gpxData: string): TrackPoint[] {
    try {
      const parser = new DOMParser();
      const gpx = parser.parseFromString(gpxData, 'application/xml');
      const trkpts = Array.from(gpx.getElementsByTagName('trkpt'));
      if (gpx.getElementsByTagName('parsererror').length || !trkpts.length) return [];
      return trkpts
        .map(pt => ({
          lat: parseFloat(pt.getAttribute('lat') || '0'),
          lon: parseFloat(pt.getAttribute('lon') || '0'),
          ele: parseFloat(pt.getElementsByTagName('ele')[0]?.textContent || '0'),
          time: pt.getElementsByTagName('time')[0]?.textContent || '',
          hr: pt.getElementsByTagName('ns3:hr')[0]
            ? parseInt(pt.getElementsByTagName('ns3:hr')[0].textContent || '0', 10)
            : null
        }))
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    } catch {
      return [];
    }
  }

  private buildTrackPolyline(points: TrackPoint[], width = 320, height = 240): string | null {
    if (!points.length) return null;
    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const latRange = Math.max(1e-6, maxLat - minLat);
    const lonRange = Math.max(1e-6, maxLon - minLon);
    const padding = 10;
    const innerWidth = Math.max(1, width - padding * 2);
    const innerHeight = Math.max(1, height - padding * 2);

    return points
      .map(point => {
        const x = ((point.lon - minLon) / lonRange) * innerWidth + padding;
        const y = innerHeight - ((point.lat - minLat) / latRange) * innerHeight + padding;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  private buildStaticTileUrl(points: TrackPoint[], zoomHint = 13): string | null {
    if (!points.length) return null;

    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const latRange = maxLat - minLat;
    const lonRange = maxLon - minLon;

    const maxRange = Math.max(latRange, lonRange);
    let zoom = zoomHint;
    if (maxRange > 1) zoom = 8;
    else if (maxRange > 0.5) zoom = 10;
    else if (maxRange > 0.2) zoom = 11;
    else if (maxRange > 0.1) zoom = 12;
    else if (maxRange > 0.05) zoom = 13;
    else if (maxRange > 0.02) zoom = 14;
    else if (maxRange > 0.01) zoom = 15;
    else zoom = 16;

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;
    const tileCoords = this.latLonToTile(centerLat, centerLon, zoom);
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileCoords.y}/${tileCoords.x}`;
  }

  private latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
    const latRad = (lat * Math.PI) / 180;
    const n = 2 ** zoom;
    const x = Math.floor(((lon + 180) / 360) * n);
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
  }

  nextEvent(manual = false): void {
    if (!this.events.length) return;
    this.carouselIndex = (this.carouselIndex + 1) % this.events.length;
    this.syncSelectionWithCarousel();
    if (manual && !this.isCarouselPaused) this.restartCarouselTimer();
  }

  prevEvent(manual = false): void {
    if (!this.events.length) return;
    this.carouselIndex = (this.carouselIndex - 1 + this.events.length) % this.events.length;
    this.syncSelectionWithCarousel();
    if (manual && !this.isCarouselPaused) this.restartCarouselTimer();
  }

  goToEvent(index: number): void {
    if (index < 0 || index >= this.events.length) return;
    this.carouselIndex = index;
    this.syncSelectionWithCarousel();
    if (!this.isCarouselPaused) {
      this.restartCarouselTimer();
    }
  }

  toggleCarouselPlayback(): void {
    this.isCarouselPaused = !this.isCarouselPaused;
    if (this.isCarouselPaused) {
      this.clearCarouselTimer();
      return;
    }
    this.restartCarouselTimer();
  }

  handleCarouselSelection(eventId: number): void {
    this.selectEvent(eventId);
  }

  canUploadMasterGpx(event: RaceEvent): boolean {
    return this.isAuthenticated && event.createdBy === this.userId;
  }

  hasMasterTrack(event: RaceEvent): boolean {
    return !!(event.gpxMaster || event.tracks?.[0]);
  }

  isDownloadingMaster(eventId: number): boolean {
    return this.downloadingMasterTracks.has(eventId);
  }

  async downloadEventMaster(event: RaceEvent, clickEvent?: Event): Promise<void> {
    clickEvent?.stopPropagation();
    if (this.isDownloadingMaster(event.id)) return;

    this.downloadingMasterTracks.add(event.id);
    try {
      const gpxData = await this.resolveMasterGpxContent(event);
      if (!gpxData) {
        this.showMessage('No se pudo descargar el track maestro.');
        return;
      }

      const blob = new Blob([gpxData], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const fileName = event.gpxMasterFileName || `${event.name || 'evento'}-master.gpx`;
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } finally {
      this.downloadingMasterTracks.delete(event.id);
    }
  }

  promptMasterGpxUpload(eventId: number): void {
    if (!this.ensureEventsAccess()) return;
    this.pendingMasterUploadEventId = eventId;
    if (this.masterGpxInputRef?.nativeElement) {
      this.masterGpxInputRef.nativeElement.click();
    }
  }

  async onMasterGpxFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.gpx')) {
      this.showMessage('Selecciona un archivo GPX válido.');
      this.resetMasterGpxInput();
      return;
    }

    const gpxData = await this.readFileAsText(file);
    if (!this.isValidGpxData(gpxData)) {
      this.showMessage('El archivo no es un GPX válido.');
      this.resetMasterGpxInput();
      return;
    }

    const targetEventId = this.pendingMasterUploadEventId;
    if (!targetEventId) {
      this.resetMasterGpxInput();
      return;
    }

    this.eventService
      .updateGpxMaster(targetEventId, {
        gpxMaster: this.encodeGpxContent(gpxData),
        gpxMasterFileName: file.name
      })
      .subscribe({
        next: updated => {
          this.events = this.events.map(ev => (ev.id === updated.id ? updated : ev));
          // también actualiza el Map si cambió el evento
          this.eventsById.set(updated.id, updated);
          void this.prepareEventVisuals(updated);
          this.resetMasterGpxInput();
        },
        error: () => {
          this.showMessage('No se pudo guardar el track maestro.');
          this.resetMasterGpxInput();
        }
      });
  }

  private resetMasterGpxInput(): void {
    this.pendingMasterUploadEventId = null;
    if (this.masterGpxInputRef?.nativeElement) {
      this.masterGpxInputRef.nativeElement.value = '';
    }
  }

  private encodeGpxContent(content: string): string {
    try {
      return btoa(unescape(encodeURIComponent(content)));
    } catch {
      return btoa(content);
    }
  }

  restartCarouselTimer(): void {
    this.clearCarouselTimer();
    if (!this.events.length || this.isCarouselPaused) return;
    this.carouselTimer = setInterval(() => this.nextEvent(), this.carouselIntervalMs);
  }

  private clearCarouselTimer(): void {
    if (this.carouselTimer) {
      clearInterval(this.carouselTimer);
      this.carouselTimer = undefined;
    }
  }

  private syncCarouselIndex(): void {
    if (!this.events.length) {
      this.carouselIndex = 0;
      return;
    }
    const selectedIndex = this.selectedEventId ? this.events.findIndex(e => e.id === this.selectedEventId) : -1;
    if (selectedIndex >= 0) {
      this.carouselIndex = selectedIndex;
    } else if (this.carouselIndex >= this.events.length) {
      this.carouselIndex = 0;
    }
  }

  private syncSelectionWithCarousel(): void {
    if (!this.events.length) return;
    const event = this.events[this.carouselIndex];
    if (!event || this.selectedEventId === event.id) return;
    this.selectEvent(event.id);
  }

  openEventSearch(): void {
    const dialogRef = this.dialog.open<EventSearchDialogComponent, EventSearchDialogData, EventSearchDialogResult>(
      EventSearchDialogComponent,
      {
        width: '95vw',
        maxWidth: '960px',
        height: 'min(700px, 90vh)',
        data: {
          events: this.events,
          selectedEventId: this.selectedEventId,
          selectedModalityId: this.selectedModalityId
        }
      }
    );

    dialogRef.afterClosed().subscribe(result => {
      if (result?.eventId) {
        this.selectMode('events');
        this.selectEvent(result.eventId, result.modalityId || undefined);
      }
    });
  }

  openCreateEventDialog(): void {
    if (!this.ensureEventsAccess()) return;
    const dialogRef = this.dialog.open<EventCreateDialogComponent, undefined, EventCreateDialogResult>(
      EventCreateDialogComponent,
      {
        width: '720px'
      }
    );

    dialogRef.afterClosed().subscribe(result => {
      if (!result?.event) return;
      const payload: CreateEventPayload = { ...result.event, createdBy: this.userId };
      this.eventService.createEvent(payload).subscribe({
        next: created => {
          this.selectMode('events');
          this.selectEvent(created.id);
        },
        error: () => this.showMessage('No se pudo crear el evento en el servidor.')
      });
    });
  }

  openUploadTrackDialog(): void {
    if (!this.ensureEventsAccess()) return;
    if (!this.events.length) {
      this.showMessage('No hay eventos disponibles para subir un track.');
      return;
    }
    const dialogRef = this.dialog.open<
      EventTrackUploadDialogComponent,
      EventTrackUploadDialogData,
      EventTrackUploadDialogResult
    >(EventTrackUploadDialogComponent, {
      width: '720px',
      data: {
        events: this.events,
        categories: this.categories,
        bikeTypes: this.bikeTypes,
        defaultEventId: this.selectedEventId ?? this.eventUpload.eventId,
        defaultCategory: this.eventUpload.category,
        defaultBikeType: this.eventUpload.bikeType
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (!result) return;
      const uploadPayload: EventTrackUploadPayload = {
        eventId: result.eventId,
        category: result.category,
        bikeType: result.bikeType,
        file: result.file
      };
      this.eventUpload = {
        ...this.eventUpload,
        eventId: uploadPayload.eventId,
        category: uploadPayload.category,
        bikeType: uploadPayload.bikeType,
        file: null
      };
      this.selectMode('events');
      this.selectEvent(uploadPayload.eventId!);
      void this.uploadTrackToEvent(uploadPayload);
    });
  }

  startBackgroundMusic(): void {
    const audio = document.getElementById('background-music') as HTMLAudioElement;
    if (audio) {
      audio.play().catch(error => {
        console.error('Error playing background music:', error);
      });
    }
  }

  triggerFileDialog(): void {
    this.fileInputRef?.nativeElement.click();
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.handleFiles(input.files);
    if (input) {
      input.value = '';
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(): void {
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
    this.handleFiles(event.dataTransfer?.files ?? null);
  }

  private handleFiles(fileList: FileList | null): void {
    if (!fileList || fileList.length === 0) return;

    const gpxFiles = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.gpx'));
    if (!gpxFiles.length) return;

    if (this.animationType === 'descubrir' && (gpxFiles.length > 1 || this.tracks.length > 0)) {
      this.showMessage(selectedUiText('discoveryOneTrackLimit'));
      return;
    }

    if (!this.isAuthenticated) {
      const incomingCount = gpxFiles.length;
      if (incomingCount > 1 || this.tracks.length >= 1 || this.tracks.length + incomingCount > 1) {
        this.notifyMultiTrackRequiresAuth();
        return;
      }
    }

    const maxAllowed = this.animationType === 'descubrir' ? 1 : this.isAuthenticated ? this.maxTracks : 1;
    const availableSlots = maxAllowed - this.tracks.length;
    if (availableSlots <= 0) {
      if (!this.isAuthenticated) {
        this.notifyMultiTrackRequiresAuth();
      } else {
        this.showMessage(`Puedes cargar como máximo ${this.maxTracks} archivos GPX a la vez.`, 'Límite de tracks');
      }
      return;
    }

    const files = gpxFiles.slice(0, availableSlots);
    if (!files.length) return;

    files.forEach(file => this.onFileSelected(file));
  }

  private onFileSelected(file: File): void {
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      const gpxData = e.target.result as string;
      await this.parseGPX(gpxData, file);
    };
    reader.readAsText(file);
  }

  private parseGpxData(gpxData: string, fileName: string, colorIndex: number): ParsedTrackResult {
    const parser = new DOMParser();
    const gpx = parser.parseFromString(gpxData, 'application/xml');
    const trackPoints = gpx.getElementsByTagNameNS('*', 'trkpt');
    const trkpts = Array.from(trackPoints.length ? trackPoints : gpx.getElementsByTagNameNS('*', 'rtept'))
      .filter(point => {
        const lat = Number(point.getAttribute('lat') ?? NaN);
        const lon = Number(point.getAttribute('lon') ?? NaN);
        return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
      });

    if (gpx.getElementsByTagName('parsererror').length || trkpts.length === 0) {
      throw new Error('GPX inválido');
    }

    const elevation = calculateGpxElevation(gpxData);
    const segments = new Map<Element, number>();
    const segmentOf = (point: Element): number => {
      const parent = point.parentElement ?? gpx.documentElement;
      if (!segments.has(parent)) segments.set(parent, segments.size);
      return segments.get(parent)!;
    };
    const elevations: number[] = [];
    let firstTime: string | null = null;
    let lastTime: string | null = null;

    for (let i = 0; i < trkpts.length; i++) {
      const ele = parseFloat(trkpts[i].getElementsByTagNameNS('*', 'ele')[0]?.textContent || 'NaN');
      const time = trkpts[i].getElementsByTagNameNS('*', 'time')[0]?.textContent || '';

      if (i === 0) {
        firstTime = time;
      }
      lastTime = time || lastTime;

      elevations.push(ele);
    }

    const date = firstTime ? new Date(firstTime).toLocaleString() : new Date().toLocaleString();
    const durationSeconds =
      firstTime && lastTime ? Math.max(0, (new Date(lastTime).getTime() - new Date(firstTime).getTime()) / 1000) : 0;

    const track: LoadedTrack = {
      name: fileName.replace(/\.[^.]+$/, ''),
      color: this.pickColor(colorIndex),
      fileName,
      details: {
        date,
        distance: elevation.distanceKm,
        ascent: elevation.gain ?? Number.NaN,
        elevationStatus: elevation.status,
        elevationQuality: elevation.quality
      },
      data: {
        routeXml: gpxData,
        elevations,
        trkpts: Array.from(trkpts).map((trkpt: Element) => ({
          lat: parseFloat(trkpt.getAttribute('lat')!),
          lon: parseFloat(trkpt.getAttribute('lon')!),
          ele: parseFloat(trkpt.getElementsByTagNameNS('*', 'ele')[0]?.textContent || 'NaN'),
          segment: segmentOf(trkpt),
          time: trkpt.getElementsByTagNameNS('*', 'time')[0]?.textContent || '',
          hr: trkpt.getElementsByTagNameNS('*', 'hr')[0]
            ? parseInt(trkpt.getElementsByTagNameNS('*', 'hr')[0].textContent || '0', 10)
            : null
        }))
      }
    };

    return { track, durationSeconds };
  }

  private isValidGpxData(gpxData: string): boolean {
    try {
      const parser = new DOMParser();
      const gpx = parser.parseFromString(gpxData, 'application/xml');
      return !gpx.getElementsByTagName('parsererror').length
        && (gpx.getElementsByTagNameNS('*', 'trkpt').length > 0 || gpx.getElementsByTagNameNS('*', 'rtept').length > 0);
    } catch {
      return false;
    }
  }

  private calculateActiveDurationSeconds(trkpts: TrackPoint[], pauseThresholdMs = 30_000): number {
    if (!trkpts?.length) return 0;
    const times = trkpts
      .map(p => new Date(p.time).getTime())
      .filter(t => Number.isFinite(t))
      .sort((a, b) => a - b);

    if (times.length < 2) return 0;

    let paused = 0;
    let last = times[0];
    for (let i = 1; i < times.length; i++) {
      const current = times[i];
      const dt = current - last;
      if (dt > pauseThresholdMs) {
        paused += dt;
      }
      last = current;
    }

    const total = times[times.length - 1] - times[0];
    return Math.max(0, (total - paused) / 1000);
  }

  private calculateTotalDurationSeconds(trkpts: TrackPoint[]): number {
    if (!trkpts?.length) return 0;
    const times = trkpts.map(p => new Date(p.time).getTime()).filter(t => Number.isFinite(t));

    if (times.length < 2) return 0;

    let min = times[0];
    let max = times[0];

    for (let i = 1; i < times.length; i++) {
      const current = times[i];
      if (current < min) min = current;
      if (current > max) max = current;
    }

    return Math.max(0, (max - min) / 1000);
  }

  private resolveTrackYearFromTrack(track: LoadedTrack): number | null {
    const times = track.data.trkpts
      .map(p => new Date(p.time))
      .filter(date => Number.isFinite(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (!times.length) return null;

    return times[0].getFullYear();
  }

  private resolveTrackYearFromGpx(rawGpx?: string | null): number | null {
    const gpx = this.decodeGpxContent(rawGpx);
    if (!gpx) return null;

    const points = this.parseTrackPointsFromString(gpx);
    if (!points.length) return null;

    const times = points
      .map(p => new Date(p.time))
      .filter(date => Number.isFinite(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (!times.length) return null;

    return times[0].getFullYear();
  }

  private formatDurationAsLocalTime(totalSeconds: number): string {
    const total = Math.max(0, Math.round(totalSeconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  async parseGPX(gpxData: string, file: File): Promise<void> {
    if (this.animationType === 'descubrir' && this.tracks.length) {
      this.showMessage('Descubrir ruta solo permite un GPX.');
      return;
    }
    let parsed: ParsedTrackResult;
    try {
      parsed = this.parseGpxData(gpxData, file.name, this.tracks.length);
    } catch {
      this.showMessage('El archivo no es un GPX válido.');
      return;
    }

    const { track } = parsed;

    const updatedTracks = [...this.tracks, track];
    if (await this.shouldAbortBecauseOfRouteMismatch(updatedTracks)) {
      return;
    }

    this.tracks = updatedTracks;
  }

  private async readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  private calculateTotalDistance(trkpts: HTMLCollectionOf<Element>): number {
    let totalDistance = 0;
    for (let i = 1; i < trkpts.length; i++) {
      const prevLat = parseFloat(trkpts[i - 1].getAttribute('lat')!);
      const prevLon = parseFloat(trkpts[i - 1].getAttribute('lon')!);
      const lat = parseFloat(trkpts[i].getAttribute('lat')!);
      const lon = parseFloat(trkpts[i].getAttribute('lon')!);
      totalDistance += this.calculateDistance(prevLat, prevLon, lat, lon);
    }
    return totalDistance / 1000;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private pickColor(index: number): string {
    const palette = ['#3b82f6', '#f87171', '#a855f7', '#f59e0b', '#ec4899'];
    return palette[index % palette.length];
  }

  private async shouldAbortBecauseOfRouteMismatch(tracks: LoadedTrack[]): Promise<boolean> {
    if (tracks.length < 2) return false;

    const base = tracks[0].data.trkpts;
    let minOverlap = 1;

    for (let i = 1; i < tracks.length; i++) {
      const overlap = this.computeOverlapRatio(base, tracks[i].data.trkpts);
      minOverlap = Math.min(minOverlap, overlap);
    }

    if (minOverlap < this.overlapThreshold) {
      const percentage = Math.round(minOverlap * 100);
      const continueAnyway = await firstValueFrom(
        this.dialog.open(RouteMismatchDialogComponent, { data: { percentage } }).afterClosed()
      );
      return !continueAnyway;
    }

    return false;
  }

  private computeOverlapRatio(reference: TrackPoint[], candidate: TrackPoint[]): number {
    if (!reference.length || !candidate.length) return 0;

    const sampleStepCandidate = Math.max(1, Math.floor(candidate.length / 500));
    const sampleStepReference = Math.max(1, Math.floor(reference.length / 1000));

    let matches = 0;
    let total = 0;

    for (let i = 0; i < candidate.length; i += sampleStepCandidate) {
      total++;
      if (this.isPointCloseToTrack(candidate[i], reference, sampleStepReference, this.overlapProximityMeters)) {
        matches++;
      }
    }

    return total > 0 ? matches / total : 0;
  }

  private isPointCloseToTrack(point: TrackPoint, track: TrackPoint[], step: number, thresholdMeters: number): boolean {
    for (let i = 0; i < track.length; i += step) {
      const candidate = track[i];
      const distance = this.calculateDistance(point.lat, point.lon, candidate.lat, candidate.lon);
      if (distance <= thresholdMeters) return true;
    }
    return false;
  }

  private applyMetadata(meta: TrackMetadataDialogResult): void {
    this.tracks = this.tracks.map((track, index) => ({
      ...track,
      name: meta.names[index]?.trim() || track.name,
      color: meta.colors[index] || track.color
    }));
  }

  borrarFichero(index: number): void {
    this.tracks = this.tracks.filter((_, i) => i !== index);
  }

  tracksCargados(): boolean {
    return this.tracks.length > 0 && (this.animationType !== 'descubrir' || this.tracks.length === 1);
  }

  iniciarVisualizacion(): void {
    if (!this.tracksCargados()) {
      this.showMessage(this.animationType === 'descubrir' && this.tracks.length > 1
        ? 'Descubrir ruta solo permite un GPX.' : 'Carga al menos un track.');
      return;
    }

    if (this.mode === 'routes' && !this.animationType) {
      this.setRouteView('animate');
      return;
    }

    const metadataDefaults: TrackMetadataDialogData = {
      names: this.tracks.map((t, i) => t.name || `Track ${i + 1}`),
      colors: this.tracks.map((t, i) => t.color || this.pickColor(i)),
      showColor: this.animationType !== 'descubrir'
    };

    void this.collapseMobilePanelBeforeAnimation('routes').then(() => {
      this.dialog
        .open<TrackMetadataDialogComponent, TrackMetadataDialogData, TrackMetadataDialogResult>(
          TrackMetadataDialogComponent,
          {
            width: this.isMobileViewport ? '95vw' : '520px',
            maxWidth: '95vw',
            panelClass: 'tracketeo-playback-dialog',
            data: metadataDefaults
          }
        )
        .afterClosed()
        .subscribe(meta => {
          if (!meta) {
            this.restoreMobileAnimationPanels();
            return;
          }
          this.applyMetadata(meta);
          this.abrirCuadroConfiguracion(meta);
        });
    });
  }

  private abrirCuadroConfiguracion(meta: TrackMetadataDialogResult): void {
    const permitirAdversarioVirtual = this.tracks.length > 0;

    const tracksPayload = this.tracks.map(track => ({
      trkpts: track.data.trkpts.map(p => ({
        lat: p.lat,
        lon: p.lon,
        ele: p.ele,
        time: p.time,
        hr: p.hr ?? null,
        segment: p.segment
      }))
    }));

    const namesPayload = meta.names.map((n, i) => n?.trim() || `Track ${i + 1}`);
    const colorsPayload = meta.colors.map((c, i) => c || this.pickColor(i));

    this.dialog
      .open<DialogoConfiguracionComponent, Partial<DialogoConfiguracionData>, DialogoConfiguracionData>(
        DialogoConfiguracionComponent,
        {
          width: '520px',
          maxWidth: '95vw',
          panelClass: 'tracketeo-playback-dialog',
          data: {
            tipoAnimacion: this.animationType ?? 'carrera',
            tipoAnimacionFijado: this.mode === 'routes',
            eliminarPausasLargas: false,
            marcarPausasLargas: false,
            umbralPausaSegundos: 60,
            anadirLogoTitulos: false,
            activarMusica: true,
            grabarAnimacion: false,
            relacionAspectoGrabacion: '16:9',
            permitirAdversarioVirtual,
            nombresTracks: namesPayload,
            modoVisualizacion: 'general',
            mostrarPerfil: true
          }
        }
      )
      .afterClosed()
      .subscribe(result => {
        if (!result) {
          this.restoreMobileAnimationPanels();
          return;
        }

        if (result.tipoAnimacion === 'descubrir' && tracksPayload.length !== 1) {
          this.restoreMobileAnimationPanels();
          this.showMessage('Descubrir ruta solo permite un GPX.');
          return;
        }

        let tracksFinal = tracksPayload;
        let namesFinal = namesPayload;
        let colorsFinal = colorsPayload.slice();

        if (result.tipoAnimacion !== 'descubrir' && permitirAdversarioVirtual && result.incluirAdversarioVirtual) {
          const objetivoSegundos = this.parsearTiempoObjetivo(result.tiempoAdversarioVirtual ?? '00:45');
          const virtualTrack = this.generarAdversarioVirtual(this.tracks[0], objetivoSegundos);
          if (virtualTrack) {
            tracksFinal = [...tracksPayload, virtualTrack];
            namesFinal = [...namesPayload, selectedUiText('virtualOpponent')];
            colorsFinal = [...colorsFinal, '#ff006e'];
          }
        }

        const afterLogo = (logoDataUrl: string | null) => {
          const payload = {
            names: namesFinal,
            colors: colorsFinal,
            tracks: tracksFinal,
            logo: logoDataUrl,
            rmstops: !!result.eliminarPausasLargas,
            marcarPausasLargas: !!result.marcarPausasLargas,
            umbralPausaSegundos: Math.max(60, Math.trunc(result.umbralPausaSegundos ?? 60)),
            activarMusica: !!result.activarMusica,
            grabarAnimacion: !!result.grabarAnimacion,
            relacionAspectoGrabacion: result.relacionAspectoGrabacion ?? '16:9',
            modoVisualizacion: result.modoVisualizacion ?? 'general',
            mostrarPerfil: !!result.mostrarPerfil,
            tipoAnimacion: result.tipoAnimacion ?? 'carrera',
            camaraDescubrir: result.camaraDescubrir ?? 'actual',
            velocidadDescubrir: result.velocidadDescubrir === 2 ? 2 : 1,
            trackDescubrir: 0,
            routeXml: result.tipoAnimacion === 'descubrir' ? this.tracks[0]?.data.routeXml : undefined
          };
          this.persistMapPayload(payload);

          this.router.navigate([result.tipoAnimacion === 'descubrir' ? '/discover' : '/map'], {
            queryParams: { s: '1', from: this.mode, returnTo: this.workspaceReturnUrl() },
            state: { gpxViewerPayload: payload }
          });
        };

        if (result.anadirLogoTitulos) {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/png,image/jpeg,image/webp';
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return afterLogo(null);
            try {
              const dataUrl = await this.downscaleImageFromFile(file, 122, 'image/png', 0.92, false);
              afterLogo(dataUrl);
            } catch {
              afterLogo(null);
            }
          };
          input.click();
        } else {
          afterLogo(null);
        }
      });
  }

  private persistMapPayload(payload: unknown): void {
    this.mapPayloadTransfer.set(payload);
    let persistedInStorage = false;
    try {
      sessionStorage.setItem('gpxViewerPayload', JSON.stringify(payload));
      persistedInStorage = true;
    } catch {
      persistedInStorage = false;
    }

    try {
      if (typeof window !== 'undefined') {
        window.name = `gpxViewerPayload:${encodeURIComponent(JSON.stringify(payload))}`;
        persistedInStorage = true;
      }
    } catch {
      // Ignoramos errores y mantenemos el payload en memoria mientras sea posible.
    }

    if (!persistedInStorage) {
      this.showMessage('No se pudo guardar temporalmente la animación en el navegador. Se abrirá igualmente en esta pestaña.');
    }
  }

  private downscaleImageFromFile(
    file: File,
    targetHeight = 122,
    outputType: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
    quality = 0.9,
    allowUpscale = false
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = allowUpscale ? targetHeight / img.naturalHeight : Math.min(1, targetHeight / img.naturalHeight);

          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;

          const ctx = canvas.getContext('2d')!;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);

          URL.revokeObjectURL(url);
          const q = outputType === 'image/jpeg' || outputType === 'image/webp' ? quality : undefined;
          resolve(canvas.toDataURL(outputType, q));
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = e => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  private parsearTiempoObjetivo(valor: string): number {
    const partes = valor.split(':');
    const horas = parseInt(partes[0] ?? '0', 10);
    const minutos = parseInt(partes[1] ?? '0', 10);
    const total = Math.max(0, horas * 60 + minutos);
    return total > 0 ? total * 60 : 45 * 60;
  }

  private velocidadSegunPendiente(porcentaje: number): number {
    if (porcentaje > 6) return 10;
    if (porcentaje > 2) return 12;
    if (porcentaje > -2) return 14;
    if (porcentaje > -6) return 16;
    return 18;
  }

  private generarAdversarioVirtual(track: LoadedTrack, objetivoSegundos: number): { trkpts: any[] } | null {
    if (!track?.data?.trkpts || track.data.trkpts.length < 2) return null;

    const puntos = track.data.trkpts as any[];
    const segmentos: { distancia: number; pendiente: number }[] = [];

    for (let i = 1; i < puntos.length; i++) {
      const dist = this.calculateDistance(puntos[i - 1].lat, puntos[i - 1].lon, puntos[i].lat, puntos[i].lon);
      const deltaEle = (puntos[i].ele ?? 0) - (puntos[i - 1].ele ?? 0);
      const pendiente = dist > 0 ? (deltaEle / dist) * 100 : 0;
      segmentos.push({ distancia: dist, pendiente });
    }

    if (!segmentos.length) return null;

    const windowSize = 5;
    const velocidadesSuavizadasMs = segmentos.map((seg, idx, arr) => {
      const half = Math.floor(windowSize / 2);
      let sum = 0,
        count = 0;
      for (let j = Math.max(0, idx - half); j <= Math.min(arr.length - 1, idx + half); j++) {
        const velKmh = this.velocidadSegunPendiente(arr[j].pendiente);
        sum += velKmh / 3.6;
        count++;
      }
      const media = count > 0 ? sum / count : this.velocidadSegunPendiente(seg.pendiente) / 3.6;
      return Math.max(0.5, media);
    });

    const baseDuraciones = segmentos.map((seg, idx) => seg.distancia / velocidadesSuavizadasMs[idx]);
    const totalBase = baseDuraciones.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(totalBase) || totalBase <= 0) return null;
    const factorEscala = Math.max(0.1, objetivoSegundos / totalBase);

    const inicio = new Date(puntos[0].time ?? Date.now());
    let tiempoActual = isNaN(inicio.getTime()) ? Date.now() : inicio.getTime();

    const nuevosPuntos = [{ ...puntos[0], time: new Date(tiempoActual).toISOString(), hr: puntos[0].hr ?? null }];

    for (let i = 1; i < puntos.length; i++) {
      const duracionSegmento = baseDuraciones[i - 1] * factorEscala * 1000;
      tiempoActual += duracionSegmento;
      nuevosPuntos.push({
        ...puntos[i],
        time: new Date(tiempoActual).toISOString(),
        hr: puntos[i].hr ?? null
      });
    }

    return { trkpts: nuevosPuntos };
  }

  private validateEventUpload(upload: EventTrackUploadPayload): string | null {
    const selectedEvent = this.events.find(e => e.id === upload.eventId);
    if (!selectedEvent) {
      return 'El evento seleccionado no es válido.';
    }
    const nickname = this.personalNickname || this.authService.getSession()?.nickname || '';
    if (!nickname.trim()) {
      return 'No se pudo obtener tu nick para el ranking.';
    }
    if (!upload.category) {
      return 'Selecciona tu categoría.';
    }
    if (!upload.bikeType) {
      return 'Selecciona tu tipo de bicicleta.';
    }
    if (!upload.file) {
      return 'Selecciona un archivo GPX.';
    }
    return null;
  }

  async uploadTrackToEvent(upload: EventTrackUploadPayload): Promise<void> {
    if (!this.ensureEventsAccess()) return;
    const validationError = this.validateEventUpload(upload);
    if (validationError) {
      this.showMessage(validationError);
      return;
    }

    const nickname = (this.personalNickname || this.authService.getSession()?.nickname || '').trim();
    if (!nickname) {
      this.showMessage('No se pudo obtener tu nick para el ranking.');
      return;
    }
    const routeId = upload.eventId!;
    const event = this.events.find(e => e.id === routeId);
    const modalityId = null;
    const gpxData = await this.readFileAsText(upload.file!);

    if (!this.isValidGpxData(gpxData)) {
      this.showMessage('El archivo no es un GPX válido.');
      return;
    }

    let parsed: ParsedTrackResult;
    try {
      parsed = this.parseGpxData(gpxData, upload.file!.name, 0);
    } catch {
      this.showMessage('El archivo no es un GPX válido.');
      return;
    }

    const { track, durationSeconds } = parsed;
    const trackYear = this.resolveTrackYearFromTrack(track);
    if (event?.year) {
      if (trackYear === null) {
        this.showMessage('El track no incluye una fecha válida para comprobar el año del evento.');
        return;
      }
      if (trackYear !== event.year) {
        this.showMessage(
          `El año del track (${trackYear}) no coincide con el del evento (${event.year}). Si no existe un evento para ${trackYear}, puedes crearlo.`
        );
        return;
      }
    }
    const trackDistanceKm = Number(track.details.distance);
    if (!Number.isFinite(trackDistanceKm) || trackDistanceKm <= 0) {
      this.showMessage('No se pudo calcular la distancia del track.');
      return;
    }
    const eventDistanceKm = this.toNumber(event?.distanceKm, Number.NaN);
    if (Number.isFinite(eventDistanceKm) && Math.abs(trackDistanceKm - eventDistanceKm) > 5) {
      this.showMessage(
        `La distancia del track (${trackDistanceKm.toFixed(1)} km) no coincide con la del evento (${eventDistanceKm?.toFixed(1)} km). La tolerancia máxima es de ±5 km.`
      );
      return;
    }
    const trackLocation = await this.resolveTrackLocationFromGpx(gpxData);
    const startPoint = this.extractFirstPointFromGpx(gpxData);
    const activeDurationSeconds = this.calculateActiveDurationSeconds(track.data.trkpts) || durationSeconds;
    const totalDurationSeconds = this.calculateTotalDurationSeconds(track.data.trkpts) || durationSeconds;
    if (!activeDurationSeconds) {
      this.showMessage('No se pudo calcular la duración del track.');
      return;
    }
    const timeSeconds = Math.max(1, Math.round(activeDurationSeconds));
    const tiempoReal = Math.max(1, Math.round(totalDurationSeconds || timeSeconds));
    const difficulty = this.calculateTrackDifficultyMetrics(trackDistanceKm, track.details.ascent, timeSeconds);

    const year = trackYear ?? event?.year ?? new Date().getFullYear();
    const population = trackLocation.population ?? event?.population ?? null;
    const autonomousCommunity = trackLocation.autonomousCommunity ?? event?.autonomousCommunity ?? null;
    const comarca = trackLocation.comarca ?? event?.comarca ?? null;
    const province = trackLocation.province ?? event?.province ?? null;
    const startLatitude = trackLocation.startLatitude ?? startPoint?.lat ?? null;
    const startLongitude = trackLocation.startLongitude ?? startPoint?.lon ?? null;
    const startLat = startPoint?.lat ?? startLatitude;
    const startLon = startPoint?.lon ?? startLongitude;

    const newTrack: CreateTrackPayload = {
      routeId,
      year,
      nickname,
      category: upload.category,
      bikeType: upload.bikeType,
      modalityId,
      timeSeconds,
      tiempoReal,
      distanceKm: trackDistanceKm,
      ascent: Number.isFinite(track.details.ascent) ? track.details.ascent : undefined,
      difficultyScore: difficulty.score,
      difficultyLevel: difficulty.level,
      difficultyVersion: 1,
      population,
      autonomousCommunity,
      comarca,
      province,
      startLat,
      startLon,
      routeXml: gpxData,
      fileName: upload.file!.name,
      duracionRecorrido: this.formatDurationAsLocalTime(timeSeconds),
      uploadedAt: new Date().toISOString(),
      createdBy: this.userId
    };

    // eslint-disable-next-line no-console
    console.log('Track para evento listo para enviar:', newTrack);

    this.eventService.addTrack(newTrack).subscribe({
      next: created => {
        this.latestUploadedTrackId = created.id;
        this.personalNickname = nickname;
        this.refreshPersonalHistory();
        this.selectedComparisonIds.add(created.id);
      },
      error: () => this.showMessage('No se pudo subir el track al evento.')
    });
  }

  async animateSelectedTracks(): Promise<void> {
    const event = this.selectedEvent;
    if (!event) return;

    const selectedIds = Array.from(this.selectedComparisonIds).slice(0, this.maxComparison);
    if (!selectedIds.length) {
      this.showMessage('Selecciona al menos un track para comparar.');
      return;
    }

    await this.collapseMobilePanelBeforeAnimation('events');

    const loaded: LoadedTrack[] = [];
    for (let i = 0; i < selectedIds.length; i++) {

      const trackId = selectedIds[i];
      const trackInfo = this.routeTrackTimes.find(track => track.id === trackId);
      console.log("trackinfo:", trackInfo)
      try {
        const gpxFile = await firstValueFrom(this.eventService.getTrackGpx(trackId));
        console.log("gpx:", gpxFile)
        const gpxData = gpxFile.routeXml ?? null;
        if (!gpxData) continue;

        const fileName = gpxFile.fileName || trackInfo?.nickname || `Track ${trackId}`;
        const { track } = this.parseGpxData(gpxData, fileName, i);

        loaded.push({
          ...track,
          color: this.pickColor(i),
          name: trackInfo ? `${trackInfo.nickname} • ${trackInfo.category}` : track.name
        });
      } catch {
        continue;
      }
    }

    if (!loaded.length) {
      this.restoreMobileAnimationPanels();
      this.showMessage('No se pudieron cargar los tracks seleccionados.');
      return;
    }

    this.tracks = loaded;
    this.iniciarVisualizacion();
  }


  toggleComparisonSelection(trackId: number): void {
    if (this.selectedComparisonIds.has(trackId)) {
      this.selectedComparisonIds.delete(trackId);
      return;
    }
    if (this.selectedComparisonIds.size >= this.maxComparison) {
      this.showMessage(`Puedes seleccionar como máximo ${this.maxComparison} tracks para animar.`);
      return;
    }
    this.selectedComparisonIds.add(trackId);
  }

  isComparisonSelectionDisabled(trackId: number): boolean {
    return !this.selectedComparisonIds.has(trackId) && this.selectedComparisonIds.size >= this.maxComparison;
  }

  get rankingCategories(): string[] {
    const categories = new Set<string>();
    this.routeTrackTimes.forEach(track => {
      if (track.category) {
        categories.add(track.category);
      }
    });
    return Array.from(categories).sort((a, b) => a.localeCompare(b, 'es'));
  }

  get filteredRouteTrackTimes(): RouteTrackTime[] {
    if (this.selectedRankingCategory === 'all') {
      return this.routeTrackTimes;
    }
    return this.routeTrackTimes.filter(track => track.category === this.selectedRankingCategory);
  }

  onRankingCategoryChange(category: string): void {
    this.selectedRankingCategory = category || 'all';
  }

  async downloadComparisonTrack(trackId: number): Promise<void> {
    try {
      const trackGpx = await firstValueFrom(this.eventService.getTrackGpx(trackId));
      const gpxData = trackGpx.routeXml ?? null;
      if (!gpxData) {
        this.showMessage('No se pudo descargar el track seleccionado.');
        return;
      }

      const blob = new Blob([gpxData], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = trackGpx.fileName || `track-${trackId}.gpx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch {
      this.showMessage('No se pudo descargar el track seleccionado.');
    }
  }

  canDeleteTrack(track: EventTrack): boolean {
    if (track.createdBy === this.userId) return true;
    return Boolean(!track.createdBy && this.personalNickname && track.nickname === this.personalNickname);
  }

  deleteTrack(trackId: number, eventId?: number): void {
    if (!this.ensureEventsAccess()) return;
    const targetEventId = eventId ?? this.selectedEventId;
    if (!targetEventId) return;
    const event = this.events.find(e => e.id === targetEventId);
    const track = event?.tracks.find(t => t.id === trackId);
    if (!track || !this.canDeleteTrack(track)) return;

    this.eventService.removeTrack(targetEventId, trackId, this.userId).subscribe(removed => {
      if (!removed) return;
      this.selectedComparisonIds.delete(trackId);
      if (this.latestUploadedTrackId === trackId) {
        this.latestUploadedTrackId = null;
      }
      this.refreshPersonalHistory();
    });
  }

  get ranking(): EventTrack[] {
    const event = this.selectedEvent;
    if (!event) return [];
    const bestByNickname = new Map<string, EventTrack>();
    event.tracks.forEach(track => {
      const current = bestByNickname.get(track.nickname);
      if (!current || track.timeSeconds < current.timeSeconds) {
        bestByNickname.set(track.nickname, track);
      }
    });
    return Array.from(bestByNickname.values()).sort((a, b) => a.timeSeconds - b.timeSeconds);
  }

  get availableTracks(): EventTrack[] {
    return this.selectedEvent?.tracks ?? [];
  }

  getEventRanking(event: RaceEvent, limit = 3): EventTrack[] {
    const bestByNickname = new Map<string, EventTrack>();
    event.tracks.forEach(track => {
      const current = bestByNickname.get(track.nickname);
      if (!current || track.timeSeconds < current.timeSeconds) {
        bestByNickname.set(track.nickname, track);
      }
    });
    return Array.from(bestByNickname.values())
      .sort((a, b) => a.timeSeconds - b.timeSeconds)
      .slice(0, limit);
  }

  private refreshPersonalHistory(): void {
    const nickname = this.personalNickname;
    if (!nickname) {
      this.personalHistory = [];
      return;
    }
    const event = this.selectedEvent;
    if (!event) return;
    this.personalHistory = event.tracks
      .filter(t => t.nickname === nickname)
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  private loadRouteTrackTimes(routeId: number): void {
    if (!this.isAuthenticated) {
      this.routeTrackTimes = [];
      return;
    }
    this.eventService.getRouteTrackTimes(routeId).subscribe(times => {
      this.routeTrackTimes = (times || []).slice().sort((a, b) => a.tiempoReal - b.tiempoReal);
      this.selectedRankingCategory = 'all';
    });
  }

  // =========================
  // REFRESH OPTIMIZADO
  // =========================
  async refreshUserTracks(): Promise<void> {

    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      if (!this.isAuthenticated) {
        this.resetUserTrackRows();
        return;
      }

      if ((this.routeView === 'archive' || this.choosingFromArchive) && !this.pendingArchiveRestore) {
        this.rememberArchivePosition();
        this.pendingArchiveRestore = true;
      }
      this.userTracksLoading = true;
      this.sharedTracksLoading = true;
      try {
        const [tracks, sharedTracks] = await Promise.all([
          firstValueFrom(this.eventService.getMyTracks(false)),
          firstValueFrom(this.eventService.getSharedTracks(false))
        ]);

        const rows = tracks.map(track => this.toUserTrackRow(track, this.eventsById));
        const sharedRows = (sharedTracks || []).map(track => ({
          ...this.toUserTrackRow(track, this.eventsById),
          canDelete: false
        }));

        // Los GPX importados en antiguos eventos siguen perteneciendo al usuario.
        this.userTrackRows.personal = rows;
        this.userTrackRows.events = [];
        this.userTrackRows.shared = sharedRows;
        (Object.keys(this.userTrackRows) as UserTracksTab[]).forEach(tab => {
          const origin = this.proximityOrigins[tab];
          if (!origin || this.tableState[tab].groupBy !== 'proximity') return;
          this.userTrackRows[tab].forEach(row => {
            const metrics = this.proximityMetrics[`${tab}:${row.trackId}`];
            if (metrics && Number.isFinite(metrics.proximityRank)) Object.assign(row, metrics);
            else {
              row.proximityMeters = this.hasStartCoordinates(row)
                ? this.calculateDistance(origin.lat, origin.lon, Number(row.startLat), Number(row.startLon)) : null;
              row.proximityRank = Number.POSITIVE_INFINITY;
            }
          });
        });
        this.bumpUserTracksDataVersion('personal');
        this.bumpUserTracksDataVersion('events');
        this.bumpUserTracksDataVersion('shared');
        this.revealRecentlyAddedTrack();
        const analysisTrackId = Number(this.route.snapshot.queryParamMap.get('analysisTrackId'));
        const analysisRoute = [...rows, ...sharedRows].find(row => row.trackId === analysisTrackId);
        if (analysisRoute) {
          await this.router.navigate([], { relativeTo: this.route, queryParams: { analysisTrackId: null }, queryParamsHandling: 'merge', replaceUrl: true });
          await this.viewUserTrack(analysisRoute);
        }
      } catch {
        this.showMessage('No se pudieron cargar tus tracks. Inténtalo de nuevo más tarde.');
        this.resetUserTrackRows();
      } finally {
        this.userTracksLoading = false;
        this.sharedTracksLoading = false;
        if (this.pendingArchiveRestore) this.restoreArchivePosition();
        else if (this.selectedDestination) {
          this.selectedDestination = this.groupedUserTracks.find(group => group.province === this.selectedDestination?.province) ?? null;
        }
      }
    })().finally(() => {
      this.refreshInFlight = undefined;
      if (this.refreshAgainRequested) {
        this.refreshAgainRequested = false;
        this.requestRefreshUserTracks();
      }
    });

    return this.refreshInFlight;
  }

  private resetUserTrackRows(): void {
    (Object.keys(this.userTrackRows) as UserTracksTab[]).forEach(tab => {
      this.userTrackRows[tab] = [];
      this.bumpUserTracksDataVersion(tab);
    });
  }

  setUserTracksTab(tab: UserTracksTab): void {
    this.activeUserTracksTab = tab;
    this.selectedDestination = null;
    this.savedDestination = null;
    this.archiveScroll = 0;
    this.expandedProvinces[tab].clear();
    if (this.isAuthenticated && tab === 'analyses' && !this.publicAnalysesLoading && !this.publicAnalyses.length) {
      this.loadPublicAnalyses();
    }
  }

  getUserTrackRows(tab: UserTracksTab): UserTrackRow[] {
    return this.userTrackRows[tab];
  }

  get activeTracksLoading(): boolean {
    if (this.activeUserTracksTab === 'analyses') return this.publicAnalysesLoading;
    return this.activeUserTracksTab === 'shared' ? this.sharedTracksLoading : this.userTracksLoading;
  }

  get activeTracksLoadingLabel(): string {
    if (this.activeUserTracksTab === 'analyses') return selectedUiText('loadingPublicAnalyses');
    if (this.activeUserTracksTab === 'shared') return selectedUiText('loadingSharedRoutes');
    return selectedUiText('loadingYourRoutes');
  }

  get activeTracksEmptyMessage(): string {
    if (this.activeUserTracksTab === 'analyses') return this.publicAnalysesError ?? selectedUiText('noPublicAnalyses');
    if (this.activeUserTracksTab === 'shared') return selectedUiText('noSharedRoutes');
    return selectedUiText('noOwnRoutes');
  }

  private pickFirstText(obj: any, keys: string[]): string | null {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== null && v !== undefined) {
        const s = String(v).trim();
        if (s) return s;
      }
    }
    return null;
  }

  private toUserTrackRow(track: EventTrack, eventsById: Map<number, RaceEvent>): UserTrackRow {
    const routeIdValue = track.routeId === null || track.routeId === undefined ? null : this.toNumber(track.routeId, 0);
    const routeId = routeIdValue !== null && routeIdValue > 0 ? routeIdValue : null;

    const event = routeId ? eventsById.get(routeId) : undefined;

    const year = this.resolveTrackYear(track, event);
    const population = track.population ?? event?.population ?? null;
    const autonomousCommunity = track.autonomousCommunity ?? event?.autonomousCommunity ?? null;
    const comarca = track.comarca ?? event?.comarca ?? null;
    const province = track.province ?? event?.province ?? null;
    const distanceKm = this.toNumber(track.distanceKm);
    const ascentMeters = this.toOptionalNumber(
      (track as any).ascent
      ?? (track as any).desnivel
      ?? (track as any).elevationGain
      ?? (track as any).elevation_gain
      ?? (track as any).elevationGainM
      ?? (track as any).elevation_gain_m
    );
    const timeSeconds = this.toNumber(track.timeSeconds);
    const totalTimeSeconds = this.resolveTotalTimeSeconds(track);
    const difficultyScore = this.toOptionalNumber((track as any).difficultyScore ?? (track as any).difficulty_score);
    const difficultyLevel = this.toOptionalNumber((track as any).difficultyLevel ?? (track as any).difficulty_level);
    const difficultyVersion = this.toOptionalNumber((track as any).difficultyVersion ?? (track as any).difficulty_version);
    // IMPORTANTE (rendimiento móvil):
    // Evitamos decodificar y parsear GPX al construir cada fila de la tabla.
    // Esa operación (base64 + XML) para docenas/centenares de tracks bloquea la UI
    // y acaba afectando clicks en botones/diálogos. El GPX se resuelve de forma
    // diferida cuando realmente se necesita (animar/descargar).
    const startLat = track.startLat ?? null;
    const startLon = track.startLon ?? null;

    const title = this.pickFirstText(track as any, ['title', 'trackTitle', 'track_title']);
    const description = this.pickFirstText(track as any, ['description', 'trackDescription', 'track_description']);
    const normalizedTitle = this.normalizeTrackText(title);
    const normalizedDescription = this.normalizeTrackText(description);

    return {
      trackId: track.id,
      routeId,
      nickname: this.normalizeTrackText(track.nickname),
      bikeType: track.bikeType ?? null,
      eventName: event?.name ?? '-',
      year,
      autonomousCommunity,
      comarca,
      province,
      population,
      startLat,
      startLon,
      distanceKm,
      ascentMeters,
      elevationQuality: track.elevationQuality,
      timeSeconds,
      totalTimeSeconds,
      distanceLabel: Number.isFinite(distanceKm) && distanceKm > 0 ? `${distanceKm.toFixed(1)} km` : '—',
      movingTimeLabel: this.formatDurationHms(timeSeconds),
      totalTimeLabel: this.formatDurationHms(totalTimeSeconds),
      difficultyScore,
      difficultyLevel,
      difficultyVersion,
      gpxData: track.gpxData,
      gpxAsset: track.gpxAsset,
      fileName: track.fileName,
      canDelete: this.canDeleteTrack(track),
      googleMapsLink: this.buildGoogleMapsLinkForTrack({
        startLat,
        startLon,
        population,
        province,
        autonomousCommunity,
        title: normalizedTitle,
        eventName: event?.name ?? '-'
      }),
      title: normalizedTitle,
      description: normalizedDescription
    };
  }

  getUserTrackDifficultyStyle(key: UserTrackDifficulty['key']): { [klass: string]: string } {
    const palette: Record<UserTrackDifficulty['key'], { bg: string; fg: string }> = {
      easy: { bg: '#86efac', fg: '#14532d' },
      medium: { bg: '#fde047', fg: '#713f12' },
      hard: { bg: '#fdba74', fg: '#7c2d12' },
      'very-hard': { bg: '#fca5a5', fg: '#7f1d1d' },
      unknown: { bg: '#cbd5e1', fg: '#334155' }
    };
    const colors = palette[key] ?? palette.unknown;
    return {
      'background-color': colors.bg,
      color: colors.fg
    };
  }

  getUserTrackDifficulty(row: UserTrackRow): UserTrackDifficulty {
    const level = Number(row.difficultyLevel);
    if (!Number.isFinite(level)) {
      return this.userTrackDifficultyLegend.find(item => item.key === 'unknown')!;
    }

    if (level === 1) return this.userTrackDifficultyLegend.find(item => item.key === 'easy')!;
    if (level === 2) return this.userTrackDifficultyLegend.find(item => item.key === 'medium')!;
    if (level === 3) return this.userTrackDifficultyLegend.find(item => item.key === 'hard')!;
    if (level === 4) return this.userTrackDifficultyLegend.find(item => item.key === 'very-hard')!;
    return this.userTrackDifficultyLegend.find(item => item.key === 'unknown')!;
  }

  private extractFirstPointFromGpx(gpx: string): { lat: number; lon: number } | null {
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(gpx, 'application/xml');
      const trkpt = xml.getElementsByTagName('trkpt')[0] ?? xml.querySelector('trkpt');
      if (!trkpt) return null;
      const lat = parseFloat(trkpt.getAttribute('lat') || '');
      const lon = parseFloat(trkpt.getAttribute('lon') || '');
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { lat, lon };
    } catch {
      return null;
    }
  }

  private async resolveTrackLocationFromGpx(gpxData: string): Promise<TrackLocationInfo> {
    const point = this.extractFirstPointFromGpx(gpxData);
    if (!point) {
      return {
        startLatitude: null,
        startLongitude: null,
        population: null,
        autonomousCommunity: null,
        comarca: null,
        province: null
      };
    }

    const key = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
    const cached = this.geoCache.get(key);
    if (cached) {
      return { ...cached, startLatitude: point.lat, startLongitude: point.lon };
    }

    const location = await this.reverseGeocode(point.lat, point.lon);
    if (location) {
      this.geoCache.set(key, location);
      return { ...location, startLatitude: point.lat, startLongitude: point.lon };
    }

    return {
      startLatitude: point.lat,
      startLongitude: point.lon,
      population: null,
      autonomousCommunity: null,
      comarca: null,
      province: null
    };
  }

  private async reverseGeocode(lat: number, lon: number): Promise<TrackLocationDetails | null> {
      const details = await firstValueFrom(
        this.http.get<TrackLocationDetails>(environment.geoCode, { params: { lat, lon } })
      );

      console.log("details", details)
      if (this.isCatalonia(details?.autonomousCommunity)) {
        const catalan = await this.reverseGeocodeCatalan(lat, lon);
        if (catalan) {
          return {
            ...catalan,
            province: catalan.province || details.province || (details as any).provincia || null
          };
        }
      }

      return {
        population: details.population || (details as any).city || null,
        autonomousCommunity: details.autonomousCommunity || (details as any).state || null,
        comarca: (details as any).comarca || (details as any).county || null,
        province: details.province || (details as any).provincia || null
      };   
  }

 private async reverseGeocodeCatalan(lat: number, lon: number): Promise<TrackLocationDetails | null> {
  try {
    const url =
      `https://eines.icgc.cat/geocodificador/invers` +
      `?lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lon)}` +
      `&size=1` +
      `&layers=topo2,address`; // según doc :contentReference[oaicite:2]{index=2}

    const result: any = await firstValueFrom(
      this.http.get(url, { headers: { Accept: 'application/json' } })
    );

    const properties = result?.features?.[0]?.properties;
    if (!properties) return null;

    const municipalityIdRaw = properties.id_municipi ?? properties.id_municipy ?? null;
    const municipalityId = municipalityIdRaw != null ? String(municipalityIdRaw).trim() : '';

    const provinceByMunicipalityPrefix: Record<string, string> = {
      '08': 'Barcelona',
      '17': 'Girona',
      '25': 'Lleida',
      '43': 'Tarragona'
    };

    const provinceFromMunicipalityId =
      municipalityId.length >= 2 ? (provinceByMunicipalityPrefix[municipalityId.slice(0, 2)] ?? null) : null;

    return {
      population: properties.municipi ?? null,
      autonomousCommunity: 'Catalunya',
      comarca: properties.comarca ?? null,
      province: (properties.provincia ?? properties.province ?? provinceFromMunicipalityId)
    };
  } catch {
    return null;
  }
}


  private isCatalonia(value: string | null | undefined): boolean {
    if (!value) return false;
    const normalized = value
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .trim();
    return normalized === 'cataluna' || normalized === 'catalunya';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  formatDurationHms(seconds: number): string {
    const total = Math.max(0, Math.round(seconds || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  isDownloadingTrack(row: UserTrackRow): boolean {
    return this.downloadingTracks.has(row.trackId);
  }

  isDeletingTrack(row: UserTrackRow): boolean {
    return this.deletingTracks.has(row.trackId);
  }

  isPlanningTrack(row: { trackId: number }): boolean {
    return this.planningTracks.has(row.trackId);
  }

  async planUserTrack(row: PlanningTrackRow): Promise<void> {
    if (!this.isAuthenticated) {
      this.showMessage('Inicia sesión para planificar salidas.');
      return;
    }
    if (this.isPlanningTrack(row)) return;

    const routeName = (row.title || row.eventName || selectedUiText('newOuting')).trim();

    this.planningTracks.add(row.trackId);
    try {
      const gpx = await this.resolveGpxContentForRow(row);
      if (!gpx) {
        this.showMessage('No se pudo cargar el track para planificarlo.');
        return;
      }

      const folders = await firstValueFrom(this.planService.getFolders());
      const dialogData: PlanTrackDialogData = { routeName, folders };
      const dialogRef = this.dialog.open<PlanTrackDialogComponent, PlanTrackDialogData, PlanTrackDialogResult | undefined>(
        PlanTrackDialogComponent,
        { width: '520px', maxWidth: '95vw', panelClass: 'tracketeo-auth-dialog', data: dialogData }
      );
      const result = await firstValueFrom(dialogRef.afterClosed());
      if (!result) return;

      let targetFolderId = result.folderId;
      let targetFolderName = '';

      if (result.mode === 'new') {
        const createdFolder = await firstValueFrom(this.planService.createFolder({
          name: (result.newFolderName || routeName).trim()
        }));
        targetFolderId = createdFolder.id;
        targetFolderName = createdFolder.name;
      } else {
        const folder = folders.find(current => current.id === result.folderId);
        targetFolderName = folder?.name ?? 'la carpeta seleccionada';
      }

      if (!targetFolderId) {
        this.showMessage('No se pudo resolver la carpeta de destino.');
        return;
      }

      let calculatedDesnivel: number | null = null;
      try {
        const { track } = this.parseGpxData(gpx, row.fileName || routeName || 'Track.gpx', this.tracks.length);
        calculatedDesnivel = Number.isFinite(track.details.ascent) ? Math.round(track.details.ascent) : null;
      } catch {
        calculatedDesnivel = null;
      }

      const difficulty = this.calculateTrackDifficultyMetrics(
        Number.isFinite(row.distanceKm) ? row.distanceKm : null,
        calculatedDesnivel,
        Number.isFinite(row.timeSeconds) ? row.timeSeconds : null
      );

      const payload: PlanTrackImportPayload = {
        folder_id: targetFolderId,
        created_by_user_id: this.userId,
        name: (row.fileName || routeName || selectedUiText('track')).trim(),
        start_lat: Number.isFinite(row.startLat) ? Number(row.startLat) : null,
        start_lon: Number.isFinite(row.startLon) ? Number(row.startLon) : null,
        start_population: row.population || null,
        distance_km: Number.isFinite(row.distanceKm) ? row.distanceKm : null,
        moving_time_sec: Number.isFinite(row.timeSeconds) ? row.timeSeconds : null,
        total_time_sec: Number.isFinite(row.totalTimeSeconds) ? row.totalTimeSeconds : null,
        desnivel: calculatedDesnivel,
        difficulty_score: difficulty.score,
        difficulty_level: difficulty.level,
        difficulty_version: 1,
        route_xml: gpx
      };

      await firstValueFrom(this.planService.importTrack(payload));
      this.showMessage(`Ruta añadida a ${targetFolderName || 'la carpeta seleccionada'}.`, 'Planificación guardada');
    } catch {
      this.showMessage('No se pudo planificar esta ruta. Inténtalo de nuevo.');
    } finally {
      this.planningTracks.delete(row.trackId);
    }
  }


  private calculateTrackDifficultyMetrics(distanceKmRaw: number | null, desnivelRaw: number | null, movingTimeSecRaw: number | null): { score: number | null; level: number | null } {
    const distanceKm = Number(distanceKmRaw);
    const desnivel = Number(desnivelRaw);

    if (desnivelRaw === null || !Number.isFinite(distanceKm) || distanceKm <= 0 || !Number.isFinite(desnivel) || desnivel < 0) {
      return { score: null, level: 0 };
    }

    const movingTimeHours = Number.isFinite(Number(movingTimeSecRaw)) && Number(movingTimeSecRaw) > 0
      ? Number(movingTimeSecRaw) / 3600
      : null;

    const ascentPerKm = desnivel / Math.max(distanceKm, 0.1);
    const climbRate = movingTimeHours ? desnivel / movingTimeHours : 0;

    let score = 0;
    score += Math.min(distanceKm / 35, 1) * 30;
    score += Math.min(desnivel / 1800, 1) * 35;
    score += Math.min(ascentPerKm / 140, 1) * 25;
    score += Math.min(climbRate / 900, 1) * 10;

    const normalizedScore = Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;

    if (normalizedScore >= 75) return { score: normalizedScore, level: 4 };
    if (normalizedScore >= 55) return { score: normalizedScore, level: 3 };
    if (normalizedScore >= 35) return { score: normalizedScore, level: 2 };
    return { score: normalizedScore, level: 1 };
  }

  async downloadUserTrack(row: UserTrackRow): Promise<void> {
    if (this.isDownloadingTrack(row)) return;
    this.downloadingTracks.add(row.trackId);
    try {
      const gpx = await this.resolveGpxContentForRow(row);
      if (!gpx) {
        this.showMessage('No se pudo preparar la descarga del GPX.');
        return;
      }
      const blob = new Blob([gpx], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = row.fileName || `${row.eventName}-${row.year || 'track'}.gpx`;
      link.href = url;
      link.download = safeName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } finally {
      this.downloadingTracks.delete(row.trackId);
    }
  }

  private getTableState(tab: UserTracksTab): TrackTableState {
    return this.tableState[tab];
  }

  get userTracksFilter(): string {
    return this.getTableState(this.activeUserTracksTab).filter;
  }

  get userTracksRows(): number {
    return this.getTableState(this.activeUserTracksTab).rows;
  }

  get userTracksPage(): number {
    return this.getTableState(this.activeUserTracksTab).page;
  }

  get sortedUserTracks(): UserTrackRow[] {
    return this.getSortedUserTracksForTab(this.activeUserTracksTab);
  }

  private getSortedUserTracksForTab(tab: UserTracksTab): UserTrackRow[] {
    return this.getDerivedUserTracksForTab(tab).sorted;
  }

  get filteredUserTracks(): UserTrackRow[] {
    return this.getFilteredUserTracksForTab(this.activeUserTracksTab);
  }

  get groupedUserTracks(): GroupedUserTracks[] {
    return this.getGroupedUserTracksForTab(this.activeUserTracksTab);
  }

  groupContainsRecentlyAddedTrack(group: GroupedUserTracks): boolean {
    return this.recentlyAddedTrackId !== null
      && group.routes.some(route => route.trackId === this.recentlyAddedTrackId);
  }

  private revealRecentlyAddedTrack(): void {
    if (this.recentlyAddedTrackId === null || typeof document === 'undefined') return;
    this.activeUserTracksTab = 'personal';
    this.selectedDestination = null;
    this.savedDestination = null;
    this.pendingArchiveRestore = false;
    clearTimeout(this.restorePositionTimer);
    const state = this.getTableState('personal');
    if (state.filter) {
      state.filter = '';
      state.page = 0;
      this.bumpUserTracksStateVersion('personal');
    }
    const findCard = (attempt: number) => {
      const card = document.querySelector<HTMLElement>('.destination-card--recent');
      if (!card && attempt < 20) {
        setTimeout(() => findCard(attempt + 1), 100);
        return;
      }
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => this.recentlyAddedTrackId = null, 3600);
    };
    setTimeout(() => findCard(0), 0);
  }

  private getFilteredUserTracksForTab(tab: UserTracksTab): UserTrackRow[] {
    return this.getDerivedUserTracksForTab(tab).filtered;
  }

  get paginatedUserTracks(): GroupedUserTracks[] {
    return this.getPaginatedUserTrackGroupsForTab(this.activeUserTracksTab);
  }

  private getGroupedUserTracksForTab(tab: UserTracksTab): GroupedUserTracks[] {
    return this.getDerivedUserTracksForTab(tab).grouped;
  }

  private getDerivedUserTracksForTab(tab: UserTracksTab): UserTracksDerivedData {
    const version = this.userTracksDerivedVersion[tab];
    const dataVersion = this.userTracksDataVersion[tab];
    const stateVersion = this.userTracksStateVersion[tab];
    if (version.data === dataVersion && version.state === stateVersion) {
      return this.userTracksDerived[tab];
    }

    const state = this.getTableState(tab);
    const sorted = [...this.userTrackRows[tab]].sort((a, b) => this.compareUserTrackRows(a, b, state));
    const query = state.filter.trim().toLowerCase();
    const filtered = query ? sorted.filter(row => this.matchesUserTrackFilter(row, query)) : sorted;

    if (state.groupBy === 'proximity') {
      const grouped = filtered.length
        ? [{ province: 'Ordenadas por proximidad', routes: filtered, count: filtered.length, autonomousCommunity: null }]
        : [];

      this.userTracksDerived[tab] = { sorted, filtered, grouped };
      this.userTracksDerivedVersion[tab] = { data: dataVersion, state: stateVersion };
      return this.userTracksDerived[tab];
    }

    const map = new Map<
      string,
      { routes: UserTrackRow[]; autonomousCommunity: string | null }
    >();

    filtered.forEach(route => {
      const groupKey = this.resolveUserTrackGroupValue(route, state.groupBy);
      const existing = map.get(groupKey);
      if (existing) {
        existing.routes.push(route);
        if (!existing.autonomousCommunity && route.autonomousCommunity) {
          existing.autonomousCommunity = route.autonomousCommunity;
        }
        return;
      }

      map.set(groupKey, {
        routes: [route],
        autonomousCommunity: route.autonomousCommunity ?? null
      });
    });

    const grouped = Array.from(map.entries())
      .map(([province, data]) => ({
        province,
        routes: [...data.routes].sort((a, b) =>
          this.normalizePopulationName(a.population).localeCompare(
            this.normalizePopulationName(b.population),
            'es',
            { sensitivity: 'base' }
          )
        ),
        count: data.routes.length,
        autonomousCommunity: data.autonomousCommunity
      }))
      .sort((a, b) => a.province.localeCompare(b.province, 'es', { sensitivity: 'base' }));

    this.userTracksDerived[tab] = { sorted, filtered, grouped };
    this.userTracksDerivedVersion[tab] = { data: dataVersion, state: stateVersion };
    return this.userTracksDerived[tab];
  }

  private getPaginatedUserTrackGroupsForTab(tab: UserTracksTab): GroupedUserTracks[] {
    const state = this.getTableState(tab);
    const groups = this.getGroupedUserTracksForTab(tab);
    const safePage = this.resolveSafeUserTracksPage(groups.length, state);
    if (safePage !== state.page) {
      state.page = safePage;
    }
    const start = safePage * state.rows;
    return groups.slice(start, start + state.rows);
  }

  get userTracksPageCount(): number {
    return this.getUserTracksPageCountForTab(this.activeUserTracksTab);
  }

  private getUserTracksPageCountForTab(tab: UserTracksTab): number {
    const state = this.getTableState(tab);
    const total = this.getGroupedUserTracksForTab(tab).length;
    if (!total) return 0;
    return Math.ceil(total / state.rows);
  }

  get userTracksRangeStart(): number {
    const total = this.getGroupedUserTracksForTab(this.activeUserTracksTab).length;
    if (!total) return 0;
    const state = this.getTableState(this.activeUserTracksTab);
    const safePage = this.resolveSafeUserTracksPage(total, state);
    return safePage * state.rows + 1;
  }

  get userTracksRangeEnd(): number {
    const total = this.getGroupedUserTracksForTab(this.activeUserTracksTab).length;
    if (!total) return 0;
    const state = this.getTableState(this.activeUserTracksTab);
    const safePage = this.resolveSafeUserTracksPage(total, state);
    return Math.min((safePage + 1) * state.rows, total);
  }

  sortUserTracksBy(column: UserTracksSortColumn): void {
    const state = this.getTableState(this.activeUserTracksTab);
    if (state.sortColumn === column) {
      state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      this.bumpUserTracksStateVersion(this.activeUserTracksTab);
      return;
    }

    state.sortColumn = column;
    state.sortDirection = 'asc';
    this.bumpUserTracksStateVersion(this.activeUserTracksTab);
  }

  resolveUserTracksSortIndicator(column: UserTracksSortColumn): string {
    const state = this.getTableState(this.activeUserTracksTab);
    if (state.sortColumn !== column) return '⇅';
    return state.sortDirection === 'asc' ? '▲' : '▼';
  }

  onUserTracksFilter(term: string): void {
    const state = this.getTableState(this.activeUserTracksTab);
    state.filter = term;
    state.page = 0;
    this.bumpUserTracksStateVersion(this.activeUserTracksTab);
    if (this.selectedDestination) {
      this.selectedDestination = this.groupedUserTracks.find(group => group.province === this.selectedDestination?.province) ?? null;
      this.savedDestination = this.selectedDestination?.province ?? null;
    }
  }

  onUserTracksRowsChange(rows: number): void {
    const state = this.getTableState(this.activeUserTracksTab);
    const parsed = Number(rows);
    state.rows = Number.isFinite(parsed) && parsed > 0 ? parsed : this.userTracksRowsOptions[0];
    state.page = 0;
    this.bumpUserTracksStateVersion(this.activeUserTracksTab);
  }

  get userTracksGroupBy(): UserTracksGroupBy {
    return this.getTableState(this.activeUserTracksTab).groupBy;
  }

  get userTracksGroupByLabel(): string {
    return this.userTracksGroupByOptions.find(option => option.value === this.userTracksGroupBy)?.label ?? selectedUiText('province');
  }

  get userTracksGroupByPluralLabel(): string {
    return this.userTracksGroupByOptions.find(option => option.value === this.userTracksGroupBy)?.pluralLabel ?? selectedUiText('provinces');
  }

  shouldShowUserTracksLocationColumn(column: UserTracksGroupBy): boolean {
    return this.userTracksGroupBy !== column;
  }

  onUserTracksGroupByChange(value: string): void {
    if (!this.isValidUserTracksGroupBy(value)) return;
    const state = this.getTableState(this.activeUserTracksTab);
    if (value === 'proximity') {
      void this.enableProximityGroupingForActiveTab();
      return;
    }
    this.groupingSelectionMade[this.activeUserTracksTab] = true;
    this.selectedDestination = null;
    this.savedDestination = null;
    state.groupBy = value;
    state.page = 0;
    this.expandedProvinces[this.activeUserTracksTab].clear();
    this.bumpUserTracksStateVersion(this.activeUserTracksTab);
    this.saveGroupingPreference(value);
  }

  private groupingPreferenceKey(): string | null {
    const userId = this.authService.getSession()?.id;
    return userId == null ? null : `tracketeo:archive-grouping:${userId}`;
  }

  private restoreGroupingPreferences(): void {
    const key = this.groupingPreferenceKey();
    if (!key) return;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}') as Partial<Record<UserTracksTab, string>>;
      (Object.keys(this.tableState) as UserTracksTab[]).forEach(tab => {
        const value = saved[tab];
        if (value && value !== 'proximity' && this.isValidUserTracksGroupBy(value)) {
          this.tableState[tab].groupBy = value;
          this.groupingSelectionMade[tab] = true;
        }
      });
    } catch { /* Storage may be unavailable in private browsing. */ }
  }

  private saveGroupingPreference(value: UserTracksGroupBy): void {
    const key = this.groupingPreferenceKey();
    if (!key || value === 'proximity') return;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}') as Partial<Record<UserTracksTab, string>>;
      saved[this.activeUserTracksTab] = value;
      localStorage.setItem(key, JSON.stringify(saved));
    } catch { /* The current selection still works without storage. */ }
  }

  changeUserTracksPage(delta: number): void {
    const state = this.getTableState(this.activeUserTracksTab);
    const pageCount = this.getUserTracksPageCountForTab(this.activeUserTracksTab);
    if (!pageCount) {
      state.page = 0;
      return;
    }
    const nextPage = Math.min(Math.max(state.page + delta, 0), pageCount - 1);
    state.page = nextPage;
  }

  private resolveSafeUserTracksPage(total: number, state: TrackTableState): number {
    if (!total) return 0;
    const pageCount = Math.ceil(total / state.rows);
    return Math.min(state.page, pageCount - 1);
  }

  private matchesUserTrackFilter(row: UserTrackRow, query: string): boolean {
    const searchable = [
      row.title,
      row.nickname,
      row.bikeType,
      row.eventName,
      row.autonomousCommunity,
      row.comarca,
      row.province,
      row.population,
      row.year?.toString(),
      row.distanceLabel,
      row.movingTimeLabel,
      row.totalTimeLabel
    ];

    return searchable.some(value => (value ?? '').toString().toLowerCase().includes(query));
  }

  private compareUserTrackRows(a: UserTrackRow, b: UserTrackRow, state: TrackTableState): number {
    if (state.groupBy === 'proximity') {
      const rankA = Number.isFinite(a.proximityRank) ? Number(a.proximityRank) : Number.POSITIVE_INFINITY;
      const rankB = Number.isFinite(b.proximityRank) ? Number(b.proximityRank) : Number.POSITIVE_INFINITY;
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      const proximityA = Number.isFinite(a.proximityMeters) ? Number(a.proximityMeters) : Number.POSITIVE_INFINITY;
      const proximityB = Number.isFinite(b.proximityMeters) ? Number(b.proximityMeters) : Number.POSITIVE_INFINITY;
      if (proximityA !== proximityB) {
        return proximityA - proximityB;
      }

      return (a.title ?? a.eventName ?? '').localeCompare(b.title ?? b.eventName ?? '', 'es', { sensitivity: 'base' });
    }

    const direction = state.sortDirection === 'asc' ? 1 : -1;
    const key = state.sortColumn;
    const rawA = a[key] ?? '';
    const rawB = b[key] ?? '';

    if (typeof rawA === 'number' && typeof rawB === 'number') {
      if (Number.isNaN(rawA) && Number.isNaN(rawB)) return 0;
      if (Number.isNaN(rawA)) return 1 * direction;
      if (Number.isNaN(rawB)) return -1 * direction;
      if (rawA < rawB) return -1 * direction;
      if (rawA > rawB) return 1 * direction;
      return 0;
    }

    const valueA = rawA.toString().toLowerCase();
    const valueB = rawB.toString().toLowerCase();

    if (valueA < valueB) return -1 * direction;
    if (valueA > valueB) return 1 * direction;
    return 0;
  }

  private normalizePopulationName(population: string | null): string {
    const value = population?.trim();
    return value?.length ? value : this.missingLocationLabel('population');
  }

  private normalizeComarcaName(comarca: string | null): string {
    const value = comarca?.trim();
    return value?.length ? value : this.missingLocationLabel('comarca');
  }

  private normalizeAutonomousCommunityName(autonomousCommunity: string | null): string {
    const value = autonomousCommunity?.trim();
    return value?.length ? value : this.missingLocationLabel('autonomousCommunity');
  }

  private normalizeProvinceName(province: string | null): string {
    const value = province?.trim();
    return value?.length ? value : this.missingLocationLabel('province');
  }

  private missingLocationLabel(kind: 'population' | 'comarca' | 'autonomousCommunity' | 'province'): string {
    const labels: Record<AppLanguage, Record<typeof kind, string>> = {
      es: { population: 'Sin población', comarca: 'Sin comarca', autonomousCommunity: 'Sin comunidad', province: 'Sin provincia' },
      ca: { population: 'Sense població', comarca: 'Sense comarca', autonomousCommunity: 'Sense comunitat', province: 'Sense província' },
      en: { population: 'No town', comarca: 'No county', autonomousCommunity: 'No region', province: 'No province' },
      gl: { population: 'Sen poboación', comarca: 'Sen comarca', autonomousCommunity: 'Sen comunidade', province: 'Sen provincia' },
      eu: { population: 'Herririk gabe', comarca: 'Eskualderik gabe', autonomousCommunity: 'Erkidegorik gabe', province: 'Probintziarik gabe' }
    };
    return labels[this.languageService.current][kind];
  }

  private resolveUserTrackGroupValue(row: UserTrackRow, groupBy: UserTracksGroupBy): string {
    if (groupBy === 'proximity') return 'Ordenadas por proximidad';
    if (groupBy === 'autonomousCommunity') return this.normalizeAutonomousCommunityName(row.autonomousCommunity);
    if (groupBy === 'province') return this.normalizeProvinceName(row.province);
    if (groupBy === 'population') return this.normalizePopulationName(row.population);
    return this.normalizeComarcaName(row.comarca);
  }

  private isValidUserTracksGroupBy(value: string): value is UserTracksGroupBy {
    return this.userTracksGroupByOptions.some(option => option.value === value);
  }

  get isUserTracksProximityView(): boolean {
    return this.getTableState(this.activeUserTracksTab).groupBy === 'proximity';
  }

  formatProximityMeters(value: number | null | undefined): string {
    if (!Number.isFinite(value)) return '—';
    const meters = Number(value);
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }

  get isActiveUserTracksProximityLoading(): boolean {
    return this.proximityLoadingTabs.has(this.activeUserTracksTab);
  }

  private async enableProximityGroupingForActiveTab(): Promise<void> {
    const tab = this.activeUserTracksTab;
    if (this.proximityLoadingTabs.has(tab)) return;
    const choice = await firstValueFrom(this.dialog.open<ProximityOriginDialogComponent, void, ProximityOriginChoice>(ProximityOriginDialogComponent, {
      width: '540px', maxWidth: '95vw', panelClass: 'tracketeo-auth-dialog'
    }).afterClosed());
    if (!choice) return;
    const state = this.getTableState(tab);
    const previousGroupBy = state.groupBy;
    this.proximityLoadingTabs.add(tab);

    try {
      const userLocation: ProximityOrigin = choice === 'current'
        ? { ...await this.resolveCurrentPosition(), label: selectedUiText('currentLocation') } : choice;
      const rowsWithCoords: Array<{ row: UserTrackRow; haversineMeters: number }> = [];

      this.userTrackRows[tab].forEach(row => {
        if (!this.hasStartCoordinates(row)) {
          row.proximityMeters = null;
          row.proximityRank = Number.POSITIVE_INFINITY;
          row.proximityRoadDurationS = null;
          return;
        }

        const haversineMeters = this.calculateDistance(userLocation.lat, userLocation.lon, Number(row.startLat), Number(row.startLon));
        row.proximityMeters = haversineMeters;
        row.proximityRoadDurationS = null;
        rowsWithCoords.push({ row, haversineMeters });
      });

      rowsWithCoords
        .sort((a, b) => a.haversineMeters - b.haversineMeters)
        .forEach((item, index) => {
          item.row.proximityRank = index;
        });

      await this.refineTopProximityRowsWithMatrix(tab, userLocation, rowsWithCoords);

      this.proximityOrigins[tab] = userLocation;
      if (tab === this.activeUserTracksTab) {
        this.selectedDestination = null;
        this.savedDestination = null;
      }
      state.groupBy = 'proximity';
      this.groupingSelectionMade[tab] = true;
      state.page = 0;
      this.expandedProvinces[tab].clear();
      this.expandedProvinces[tab].add('Ordenadas por proximidad');
      this.bumpUserTracksDataVersion(tab);
      this.bumpUserTracksStateVersion(tab);
      this.saveWorkspaceState();
    } catch {
      state.groupBy = previousGroupBy;
      this.showMessage('No se pudo obtener tu ubicación. Mantengo la agrupación actual.', 'Ubicación no disponible');
    } finally {
      this.proximityLoadingTabs.delete(tab);
    }
  }

  get proximityOriginLabel(): string { return this.proximityOrigins[this.activeUserTracksTab]?.label ?? ''; }

  private async refineTopProximityRowsWithMatrix(
    tab: UserTracksTab,
    userLocation: { lat: number; lon: number },
    rowsWithCoords: Array<{ row: UserTrackRow; haversineMeters: number }>
  ): Promise<void> {
    const topRows = rowsWithCoords.slice(0, 10);
    if (!topRows.length) return;

    const payload: ProximityMatrixRequest = {
      profile: 'driving-car',
      origin: userLocation,
      candidates: topRows.map(item => ({
        trackId: item.row.trackId,
        startLat: Number(item.row.startLat),
        startLon: Number(item.row.startLon),
        haversineKm: Number((item.haversineMeters / 1000).toFixed(3))
      })),
      options: {
        metrics: ['duration', 'distance'],
        units: 'm',
        resolveOrderBy: 'duration',
        fallback: 'haversine'
      }
    };

    try {
      const response = await firstValueFrom(
        this.http.post<ProximityMatrixResponse>(`${environment.routingApiBase}/matrix-rank`, payload)
      );

      if (!response?.ordered?.length || response.strategyUsed !== 'matrix') {
        return;
      }

      const rankedTop = response.ordered
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .map(entry => entry.trackId);
      const rankByTrackId = new Map<number, number>(rankedTop.map((trackId, index) => [trackId, index]));
      const metricsByTrackId = new Map<number, { roadDistanceM: number | null; roadDurationS: number | null }>(
        response.ordered.map(entry => [
          entry.trackId,
          { roadDistanceM: entry.roadDistanceM, roadDurationS: entry.roadDurationS }
        ])
      );

      topRows.forEach(({ row }, fallbackIndex) => {
        const roadRank = rankByTrackId.get(row.trackId);
        row.proximityRank = roadRank !== undefined ? roadRank : fallbackIndex;
        const metrics = metricsByTrackId.get(row.trackId);
        row.proximityRoadDurationS = metrics?.roadDurationS ?? null;
        if (Number.isFinite(metrics?.roadDistanceM)) {
          row.proximityMeters = Number(metrics?.roadDistanceM);
        }
      });

      const fallbackStartIndex = topRows.length;
      rowsWithCoords.slice(topRows.length).forEach(({ row }, index) => {
        row.proximityRank = fallbackStartIndex + index;
      });

      this.bumpUserTracksDataVersion(tab);
    } catch {
      // Mantener orden por Haversine si la llamada al backend no está disponible.
    }
  }

  private resolveCurrentPosition(): Promise<{ lat: number; lon: number }> {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new Error('Geolocalización no soportada'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        position => {
          resolve({ lat: position.coords.latitude, lon: position.coords.longitude });
        },
        () => reject(new Error('Permiso denegado o posición no disponible')),
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    });
  }

  isProvinceExpanded(province: string): boolean {
    return this.expandedProvinces[this.activeUserTracksTab].has(province);
  }

  toggleProvinceExpansion(province: string): void {
    const expanded = this.expandedProvinces[this.activeUserTracksTab];
    if (expanded.has(province)) {
      expanded.delete(province);
      return;
    }

    expanded.add(province);
  }

  onProvinceRowClick(province: string): void {
    if (!window.matchMedia('(max-width: 768px)').matches) {
      return;
    }

    this.toggleProvinceExpansion(province);
  }

  hasStartCoordinates(row: { startLat?: number | null; startLon?: number | null }): boolean {
    return Number.isFinite(row.startLat) && Number.isFinite(row.startLon);
  }

  //Enlace a google maps
  buildGoogleMapsLinkForTrack(row: {
    startLat?: number | null;
    startLon?: number | null;
    population?: string | null;
    province?: string | null;
    autonomousCommunity?: string | null;
    title?: string | null;
    eventName?: string | null;
  }): string {
    if (this.hasStartCoordinates(row)) {
      const destination = `${row.startLat},${row.startLon}`;
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    }

    const query = [row.population, row.province, row.autonomousCommunity]
      .filter(Boolean)
      .join(', ');
    const fallbackQuery = query || row.title || row.eventName || 'Inicio de ruta';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackQuery)}`;
  }

  async animateUserTrack(row: UserTrackRow): Promise<void> {
    if (this.loadingAnimationTrackId !== null) return;
    if (this.choosingFromArchive && this.animationType === 'descubrir' && this.tracks.length) {
      this.showMessage(selectedUiText('discoveryOneTrackLimit'));
      return;
    }
    if (this.choosingFromArchive && this.tracks.length >= this.maxTracks) {
      this.showMessage(`Puedes cargar como máximo ${this.maxTracks} archivos GPX a la vez.`, 'Límite de tracks');
      return;
    }
    this.loadingAnimationTrackId = row.trackId;
    try {
      const gpx = await this.resolveGpxContentForRow(row);
      if (!gpx || !this.isValidGpxData(gpx)) {
        this.showMessage('No se pudo cargar un GPX válido para animarlo.');
        return;
      }
      const { track } = this.parseGpxData(gpx, row.fileName || row.eventName || selectedUiText('track'), this.tracks.length);
      if (this.choosingFromArchive && this.animationType === 'descubrir' && this.tracks.length) return;
      track.name = row.title || track.name;
      const updatedTracks = this.choosingFromArchive ? [...this.tracks, track] : [track];
      if (await this.shouldAbortBecauseOfRouteMismatch(updatedTracks)) return;
      this.tracks = updatedTracks;
      this.archiveReturn = this.choosingFromArchive ? 'picker' : 'archive';
      if (!this.choosingFromArchive) this.animationType = null;
      this.setRouteView('animate');
    } catch {
      this.showMessage('No se pudo procesar el track.');
    } finally {
      this.loadingAnimationTrackId = null;
    }
  }

  async viewUserTrack(row: UserTrackRow): Promise<void> {
    const gpx = await this.resolveGpxContentForRow(row);
    if (!gpx) {
      this.showMessage('No se pudo cargar el track para visualizarlo.');
      return;
    }

    this.openTrackMap(row.trackId, row.title || row.eventName || selectedUiText('track'), gpx, row.canDelete);
  }

  private openTrackMap(trackId: number, title: string, gpx: string, allowEditing = false, source: 'archive' | 'plan' = 'archive', folderId?: number): void {

    const trkpts = this.parseTrackPointsFromString(gpx);
    if (!trkpts.length) {
      this.showMessage('El track no contiene puntos válidos para visualizar.');
      return;
    }

    const payload = {
      names: [title],
      colors: [],
      tracks: [{ trkpts }],
      logo: null,
      rmstops: true,
      marcarPausasLargas: false,
      umbralPausaSegundos: 60,
      activarMusica: false,
      grabarAnimacion: false,
      relacionAspectoGrabacion: '16:9',
      modoVisualizacion: 'general',
      mostrarPerfil: true,
      viewOnly: true,
      trackId,
      routeXml: gpx,
      trackSource: source,
      allowEditing
    };

    this.persistMapPayload(payload);
    this.router.navigate(['/map'], {
      queryParams: { from: source === 'plan' ? 'plan' : this.mode === 'routes' && this.routeView === 'archive' ? 'archive' : this.mode, folderId, returnTo: this.workspaceReturnUrl() },
      state: { gpxViewerPayload: payload }
    });
  }

  openDestination(group: GroupedUserTracks): void {
    this.destinationListScroll = document.querySelector('.route-workspace')?.scrollTop ?? 0;
    this.selectedDestination = group;
    this.savedDestination = group.province;
    this.resolveDestinationDescription(group);
    setTimeout(() => this.userTracksSectionRef?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  closeDestination(): void {
    this.selectedDestination = null;
    this.savedDestination = null;
    const top = this.destinationListScroll;
    this.archiveScroll = top;
    setTimeout(() => document.querySelector('.route-workspace')?.scrollTo({ top, behavior: 'auto' }));
  }

  destinationDistanceRange(group: GroupedUserTracks): string {
    const values = group.routes.map(route => route.distanceKm).filter(Number.isFinite);
    if (!values.length) return 'Distancia por descubrir';
    const min = Math.round(Math.min(...values));
    const max = Math.round(Math.max(...values));
    return min === max ? `${min} km` : `${min}–${max} km`;
  }

  destinationDescription(group: GroupedUserTracks): string {
    if (this.isMissingDestination(group)) return '';
    return this.destinationDescriptions.get(this.destinationDescriptionKey(group)) ?? '';
  }

  refreshDestinationDescription(group: GroupedUserTracks): void {
    if (this.isMissingDestination(group) || this.userTracksGroupBy === 'proximity') return;
    this.refreshPlaceDescription({ type: this.userTracksGroupBy, name: group.province, context: group.autonomousCommunity });
  }

  private isMissingDestination(group: GroupedUserTracks): boolean {
    const field = this.userTracksGroupBy;
    return field !== 'proximity' && !group.routes.some(route => !!route[field]?.trim());
  }

  routePopulationDescription(row: UserTrackRow): string {
    if (!row.population) return '';
    return this.destinationDescriptions.get(this.placeDescriptionKey('population', row.population, row.province)) ?? '';
  }

  refreshRoutePopulationDescription(row: UserTrackRow): void {
    if (!row.population) return;
    this.refreshPlaceDescription({ type: 'population', name: row.population, context: row.province });
  }

  private refreshPlaceDescription(place: { type: string; name: string; context: string | null }): void {
    const key = this.placeDescriptionKey(place.type, place.name, place.context);
    if (this.refreshingPlaceDescriptionKey) return;
    this.refreshingPlaceDescriptionKey = key;
    const apiBase = environment.routeAnalysisApiBase.replace(/\/route-analysis\/?$/, '');
    this.http.post<{ description: string }>(`${apiBase}/destination-descriptions/refresh`, {
      language: this.languageService.current,
      places: [place]
    }).subscribe({
      next: response => {
        if (response.description?.trim()) this.destinationDescriptions.set(key, response.description.trim());
        this.refreshingPlaceDescriptionKey = null;
      },
      error: () => {
        this.refreshingPlaceDescriptionKey = null;
        this.showMessage(selectedUiText('placeDescriptionRefreshFailed'));
      }
    });
  }

  private resolveDestinationDescription(group: GroupedUserTracks): void {
    const groupPlace = {
      type: this.userTracksGroupBy,
      name: group.province,
      context: group.autonomousCommunity
    };
    // Use the same identity as the route cards, independent of the chosen grouping.
    const populationPlaces = Array.from(new Map(group.routes
      .filter(route => !!route.population?.trim())
      .map(route => {
        const place = { type: 'population', name: route.population!, context: route.province };
        return [this.placeDescriptionKey(place.type, place.name, place.context), place] as const;
      })).values());
    const missingPlaces = [this.isMissingDestination(group) ? null : groupPlace, ...populationPlaces]
      .filter((place): place is typeof groupPlace => place !== null).filter(place =>
      !this.destinationDescriptions.has(this.placeDescriptionKey(place.type, place.name, place.context))
    );
    if (!missingPlaces.length) return;

    this.destinationDescriptionLoading = true;
    const apiBase = environment.routeAnalysisApiBase.replace(/\/route-analysis\/?$/, '');
    this.http.post<Array<{ type: string; name: string; context: string | null; description: string }>>(`${apiBase}/destination-descriptions/resolve`, {
      language: this.languageService.current,
      places: missingPlaces
    }).subscribe({
      next: response => {
        response?.forEach(item => {
          const description = item.description?.trim();
          if (description) this.destinationDescriptions.set(this.placeDescriptionKey(item.type, item.name, item.context), description);
        });
        this.destinationDescriptionLoading = false;
      },
      error: () => this.destinationDescriptionLoading = false
    });
  }

  private destinationDescriptionKey(group: GroupedUserTracks): string {
    return this.placeDescriptionKey(this.userTracksGroupBy, group.province, group.autonomousCommunity);
  }

  private placeDescriptionKey(type: string, name: string, context: string | null | undefined): string {
    return `${type}:${name}:${context ?? ''}`.toLocaleLowerCase();
  }

  destinationAverageAscent(group: GroupedUserTracks): string {
    const values = group.routes.map(route => Number(route.ascentMeters)).filter(value => Number.isFinite(value) && value > 0);
    if (!values.length) return 'Sin dato';
    return `${Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)} m`;
  }

  destinationPopulations(group: GroupedUserTracks): string {
    const names = Array.from(new Set(group.routes.map(route => route.population).filter((value): value is string => !!value?.trim())));
    if (!names.length) return 'Ubicaciones por catalogar';
    const visible = names.slice(0, 3).join(' · ');
    return names.length > 3 ? `${visible} · +${names.length - 3}` : visible;
  }

  destinationDifficultyRange(group: GroupedUserTracks): string {
    const levels = group.routes.map(route => Number(route.difficultyLevel)).filter(value => Number.isFinite(value) && value > 0);
    if (!levels.length) return 'Sin clasificar';
    const label = (level: number) => level <= 1 ? selectedUiText('soft') : level <= 2 ? selectedUiText('mediumDifficulty') : level <= 3 ? selectedUiText('hardDifficulty') : selectedUiText('veryHard');
    const min = label(Math.min(...levels));
    const max = label(Math.max(...levels));
    return min === max ? min : `${min}–${max}`;
  }

  openPublicAnalysis(item: PublicRouteAnalysis): void {
    this.selectedPublicAnalysis = this.selectedPublicAnalysis?.id === item.id ? null : item;
    if (this.selectedPublicAnalysis) {
      setTimeout(() => this.publicAnalysisDetailRef?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  async openAnalysisRoute(item: PublicRouteAnalysis): Promise<void> {
    const trackId = Number(item.trackId);
    if (!Number.isSafeInteger(trackId) || trackId <= 0 || this.openingAnalysisTrackId !== null) return;
    this.openingAnalysisTrackId = trackId;
    try {
      if (item.source === 'plan') {
        if (!item.folderId) throw new Error('Carpeta no disponible');
        const tracks = await firstValueFrom(this.planService.getTracks(item.folderId));
        const track = tracks.find(candidate => candidate.id === trackId);
        if (!track?.routeXml) throw new Error(selectedUiText('noGpx'));
        this.openTrackMap(trackId, track.name || item.title, track.routeXml,
          track.createdByUserId === this.userId, 'plan', item.folderId);
        return;
      }
      const row = [...this.userTrackRows.personal, ...this.userTrackRows.shared]
        .find(candidate => candidate.trackId === trackId);
      if (row) {
        await this.viewUserTrack(row);
        return;
      }
      const track = await firstValueFrom(this.eventService.getTrackGpx(trackId));
      const gpx = this.decodeGpxContent(track.routeXml);
      if (!gpx) throw new Error(selectedUiText('noGpx'));
      const ownTracks = await firstValueFrom(this.eventService.getMyTracks(false)).catch(() => [] as EventTrack[]);
      this.openTrackMap(trackId, item.title || track.fileName || 'Ruta analizada', gpx,
        ownTracks.some(own => Number(own.id) === trackId));
    } catch {
      this.showMessage('La ruta de este análisis ya no está disponible.');
    } finally {
      this.openingAnalysisTrackId = null;
    }
  }

  async planAnalysisRoute(item: PublicRouteAnalysis): Promise<void> {
    const trackId = Number(item.trackId);
    if (!Number.isSafeInteger(trackId) || trackId <= 0 || this.planningAnalysisTrackId !== null) return;
    this.planningAnalysisTrackId = trackId;
    try {
      if (item.source === 'plan') {
        if (!item.folderId) throw new Error('Carpeta no disponible');
        const tracks = await firstValueFrom(this.planService.getTracks(item.folderId));
        const track = tracks.find(candidate => candidate.id === trackId);
        const gpx = this.decodeGpxContent(track?.routeXml);
        if (!track || !gpx) throw new Error(selectedUiText('noGpx'));
        await this.planUserTrack({
          trackId, title: item.title, eventName: track.name, fileName: item.fileName || track.name,
          gpxData: gpx, distanceKm: track.distanceKm ?? item.routeStats?.distanceKm ?? 0,
          timeSeconds: track.movingTimeSec ?? 0, totalTimeSeconds: track.totalTimeSec ?? 0,
          startLat: track.startLat, startLon: track.startLon, population: track.startPopulation
        });
        return;
      }

      const row = [...this.userTrackRows.personal, ...this.userTrackRows.shared]
        .find(candidate => candidate.trackId === trackId);
      if (row) {
        await this.planUserTrack(row);
        return;
      }

      const track = await firstValueFrom(this.eventService.getTrackGpx(trackId));
      const gpx = this.decodeGpxContent(track.routeXml);
      if (!gpx) throw new Error(selectedUiText('noGpx'));
      const parsed = this.parseGpxData(gpx, item.fileName || track.fileName || item.title, this.tracks.length);
      const firstPoint = parsed.track.data.trkpts[0];
      await this.planUserTrack({
        trackId, title: item.title, eventName: item.title, fileName: item.fileName || track.fileName,
        gpxData: gpx, distanceKm: parsed.track.details.distance,
        timeSeconds: parsed.durationSeconds, totalTimeSeconds: parsed.durationSeconds,
        startLat: firstPoint?.lat, startLon: firstPoint?.lon, population: null
      });
    } catch {
      this.showMessage('La ruta de este análisis ya no está disponible.');
    } finally {
      this.planningAnalysisTrackId = null;
    }
  }

  formatPublicAnalysisDate(value: string | null | undefined): string {
    if (!value) return selectedUiText('dateUnavailable');
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? selectedUiText('dateUnavailable') : date.toLocaleDateString(document.documentElement.lang);
  }

  publicProfilePath(item: PublicRouteAnalysis): string {
    const profile = item.routeStats?.elevationProfile ?? [];
    if (profile.length < 2) return '';
    const maxKm = Math.max(1, item.routeStats?.distanceKm ?? profile[profile.length - 1].distanceKm);
    const elevations = profile.map(point => point.elevationM).filter((value): value is number => value !== null && Number.isFinite(value));
    if (elevations.length < 2) return '';
    const min = Math.min(...elevations);
    const range = Math.max(1, Math.max(...elevations) - min);
    return profile.map((point, index) => {
      if (point.elevationM === null) return '';
      const x = 20 + (point.distanceKm / maxKm) * 720;
      const y = 175 - ((point.elevationM - min) / range) * 135;
      return `${index && profile[index - 1].elevationM !== null ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }

  publicSectorX(item: PublicRouteAnalysis, km: number): number {
    return 20 + (km / Math.max(1, item.routeStats?.distanceKm ?? 1)) * 720;
  }

  publicSectorWidth(item: PublicRouteAnalysis, startKm: number, endKm: number): number {
    return Math.max(3, this.publicSectorX(item, endKm) - this.publicSectorX(item, startKm));
  }

  private loadPublicAnalyses(): void {
    if (!this.isAuthenticated || this.publicAnalysesLoading || this.publicAnalyses.length) return;
    this.publicAnalysesLoading = true;
    this.publicAnalysesError = null;
    this.routeAnalysisService.getPublicAnalyses().subscribe({
      next: analyses => {
        const archiveAnalyses = analyses.filter(item => item.source !== 'plan');
        this.publicAnalyses = archiveAnalyses.filter(item => Number.isSafeInteger(Number(item.trackId)) && Number(item.trackId) > 0);
        if (archiveAnalyses.length && !this.publicAnalyses.length) {
          this.publicAnalysesError = 'Los informes siguen guardados, pero el servidor no ha devuelto sus rutas asociadas. Es necesario actualizar el servidor para recuperarlas.';
        }
        this.recentPublicAnalyses = [...this.publicAnalyses]
          .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
          .slice(0, 6);
        this.publicAnalysesLoading = false;
      },
      error: () => {
        this.publicAnalysesLoading = false;
        this.publicAnalysesError = selectedUiText('publicAnalysesFailed');
      }
    });
  }

  async analyzeUserTrack(row: UserTrackRow): Promise<void> {
    const gpx = await this.resolveGpxContentForRow(row);
    if (!gpx) {
      this.showMessage('No se pudo cargar el track para analizarlo.');
      return;
    }

    this.router.navigate(['/analysis'], {
      queryParams: { trackId: row.trackId, source: 'tracks', returnTo: this.workspaceReturnUrl() },
      state: {
        trackId: row.trackId,
        source: 'tracks',
        routeTitle: row.population || row.title || row.eventName || 'Ruta analizada',
        fileName: row.fileName || row.title || row.eventName || 'Track.gpx',
        routeXml: gpx
      }
    });
  }

  analysisForTrack(row: UserTrackRow): PublicRouteAnalysis | undefined {
    return this.publicAnalyses.find(analysis => analysis.source !== 'plan' && analysis.trackId === row.trackId);
  }

  openTrackAnalysis(analysis: PublicRouteAnalysis): void {
    this.setUserTracksTab('analyses');
    this.selectedPublicAnalysis = analysis;
    setTimeout(() => this.publicAnalysisDetailRef?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async confirmDeleteUserTrack(row: UserTrackRow): Promise<void> {
    if (this.activeUserTracksTab === 'shared') return;
    if (!row.canDelete) return;

    const decision = await this.openInfoDialog({
      title: selectedUiText('deleteTrack'),
      message: '¿Seguro que quieres eliminar este track? Esta acción no se puede deshacer.',
      confirmLabel: selectedUiText('delete'),
      cancelLabel: selectedUiText('cancel')
    });
    if (decision !== 'confirm') return;
    this.deleteUserTrack(row);
  }

  private deleteUserTrack(row: UserTrackRow): void {
    if (this.isDeletingTrack(row)) return;
    this.deletingTracks.add(row.trackId);
    const previousRows = (Object.keys(this.userTrackRows) as UserTracksTab[])
      .reduce((snapshot, tab) => ({ ...snapshot, [tab]: this.userTrackRows[tab] }), {} as Record<UserTracksTab, UserTrackRow[]>);
    const previousDestination = this.selectedDestination;
    this.removeUserTrackLocally(row.trackId);
    this.eventService.removeTrackById(row.trackId).subscribe(removed => {
      this.deletingTracks.delete(row.trackId);
      if (removed) {
        this.publicAnalyses = this.publicAnalyses.filter(analysis => analysis.source === 'plan' || analysis.trackId !== row.trackId);
        this.recentPublicAnalyses = this.recentPublicAnalyses.filter(analysis => analysis.source === 'plan' || analysis.trackId !== row.trackId);
        if (this.selectedPublicAnalysis?.source !== 'plan' && this.selectedPublicAnalysis?.trackId === row.trackId) this.selectedPublicAnalysis = null;
      } else {
        (Object.keys(previousRows) as UserTracksTab[]).forEach(tab => {
          this.userTrackRows[tab] = previousRows[tab];
          this.bumpUserTracksDataVersion(tab);
        });
        this.selectedDestination = previousDestination;
        this.showMessage('No se pudo eliminar el track.');
      }
    });
  }

  private removeUserTrackLocally(trackId: number): void {
    (Object.keys(this.userTrackRows) as UserTracksTab[]).forEach(tab => {
      this.userTrackRows[tab] = this.userTrackRows[tab].filter(current => Number(current.trackId) !== Number(trackId));
      this.bumpUserTracksDataVersion(tab);
    });
    if (!this.selectedDestination) return;
    const remainingRoutes = this.selectedDestination.routes
      .filter(current => Number(current.trackId) !== Number(trackId));
    this.selectedDestination = remainingRoutes.length
      ? { ...this.selectedDestination, routes: remainingRoutes, count: remainingRoutes.length }
      : null;
  }

  private bumpUserTracksDataVersion(tab: UserTracksTab): void {
    this.userTracksDataVersion[tab]++;
  }

  private bumpUserTracksStateVersion(tab: UserTracksTab): void {
    this.userTracksStateVersion[tab]++;
  }

  private async resolveGpxContentForRow(row: PlanningTrackRow): Promise<string | null> {
    const decoded = this.decodeGpxContent(row.gpxData);
    if (decoded) return decoded;

    if (row.gpxAsset) {
      try {
        return await firstValueFrom(this.http.get(row.gpxAsset, { responseType: 'text' }));
      } catch {
        /* ignore */
      }
    }

    try {
      const gpxFile: TrackGpxFile | null = await firstValueFrom(this.eventService.getTrackGpx(row.trackId));
      if (gpxFile?.routeXml) {
        row.fileName = gpxFile.fileName || row.fileName;
        return this.decodeGpxContent(gpxFile.routeXml);
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  async openStandaloneUploadDialog(): Promise<void> {
    if (!this.isAuthenticated) {
      await this.openArchiveUploadInvitation();
      return;
    }
    const dialogRef = this.dialog.open<StandaloneTrackUploadDialogComponent, any, StandaloneTrackUploadResult | undefined>(
      StandaloneTrackUploadDialogComponent,
      { width: '520px', maxWidth: '95vw', maxHeight: 'calc(100dvh - 24px)', panelClass: ['tracketeo-auth-dialog', 'tracketeo-playback-dialog', 'tracketeo-upload-dialog'] }
    );
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;
    await this.uploadStandaloneTrack(result);
  }

  private async uploadStandaloneTrack(result: StandaloneTrackUploadResult): Promise<void> {
    if (this.standaloneUploadInProgress) return;
    const nickname = (this.personalNickname ||
      this.authService.getSession()?.nickname ||
      this.authService.getSession()?.email ||
      '').trim();
    if (!nickname) {
      this.showMessage('No se pudo obtener tu usuario para asignar el track.');
      return;
    }
    let gpxData: string;
    try {
      gpxData = await this.readFileAsText(result.file);
    } catch {
      this.showMessage('No se pudo leer el archivo GPX.');
      return;
    }
    if (!this.isValidGpxData(gpxData)) {
      this.showMessage('El archivo no es un GPX válido.');
      return;
    }
    let parsed: ParsedTrackResult;
    try {
      parsed = this.parseGpxData(gpxData, result.file.name, 0);
    } catch {
      this.showMessage('El archivo no es un GPX válido.');
      return;
    }

    const { track, durationSeconds } = parsed;
    const trackYear = this.resolveTrackYearFromTrack(track);
    const trackLocation = await this.resolveTrackLocationFromGpx(gpxData);
    const activeDurationSeconds = this.calculateActiveDurationSeconds(track.data.trkpts) || durationSeconds;
    const totalDurationSeconds = this.calculateTotalDurationSeconds(track.data.trkpts) || durationSeconds;
    const timeSeconds = Math.max(1, Math.round(activeDurationSeconds || durationSeconds || 1));
    const tiempoReal = Math.max(1, Math.round(totalDurationSeconds || activeDurationSeconds || durationSeconds || 1));
    const ascent = Number.isFinite(track.details.ascent) ? track.details.ascent : null;
    const difficulty = this.calculateTrackDifficultyMetrics(
      Number.isFinite(track.details.distance) ? track.details.distance : null,
      ascent,
      timeSeconds
    );
    const year = trackYear ?? new Date().getFullYear();
    const population = trackLocation.population ?? null;
    const autonomousCommunity = trackLocation.autonomousCommunity ?? null;
    const comarca = trackLocation.comarca ?? null;
    const province = trackLocation.province ?? null;
    const startLatitude = trackLocation.startLatitude ?? null;
    const startLongitude = trackLocation.startLongitude ?? null;
    const startLat = startLatitude;
    const startLon = startLongitude;

    const payload: CreateTrackPayload = {
      routeId: null,
      year,
      nickname,
      category: null,
      bikeType: 'MTB',
      modalityId: null,
      timeSeconds,
      tiempoReal,
      distanceKm: Number.isFinite(track.details.distance) ? track.details.distance : 0,
      ascent: ascent ?? undefined,
      difficultyScore: difficulty.score,
      difficultyLevel: difficulty.level,
      difficultyVersion: 1,
      routeXml: gpxData,
      fileName: result.file.name,
      uploadedAt: new Date().toISOString(),
      duracionRecorrido: this.formatDurationAsLocalTime(timeSeconds),
      createdBy: this.userId,
      population,
      autonomousCommunity,
      comarca,
      province,
      startLat,
      startLon,
      title: (result.title?.trim() || population || result.file.name || selectedUiText('track')).trim(),
      shared: result.shared
    };

    // eslint-disable-next-line no-console
    console.log('Track para Mis tracks listo para enviar:', payload);

    this.standaloneUploadInProgress = true;
    this.eventService.addTrack(payload).subscribe({
      next: created => {
        this.recentlyAddedTrackId = Number(created.id);
        created.elevationQuality = track.details.elevationQuality;
        const optimisticRow = this.toUserTrackRow(created, this.eventsById);
        this.userTrackRows.personal = [
          optimisticRow,
          ...this.userTrackRows.personal.filter(row => Number(row.trackId) !== Number(created.id))
        ];
        this.bumpUserTracksDataVersion('personal');
        this.revealRecentlyAddedTrack();
        this.requestRefreshUserTracks();
        this.showMessage(
          `${created.title || result.file.name}\n\n` +
          `${selectedUiText('province')}: ${this.normalizeProvinceName(created.province ?? null)}\n` +
          `${selectedUiText('population')}: ${this.normalizePopulationName(created.population ?? null)}`,
          selectedUiText('routeAddedToArchive')
        );
      },
      error: () => {
        this.showMessage('No se pudo subir el track.');
        this.standaloneUploadInProgress = false;
      },
      complete: () => {
        this.standaloneUploadInProgress = false;
      }
    });
  }

  formatTime(seconds: number): string {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const hh = hours ? `${hours}:` : '';
    const mm = hours ? String(minutes).padStart(2, '0') : minutes.toString();
    return `${hh}${mm}:${String(secs).padStart(2, '0')}`;
  }

  findModalityName(modalityId: number | null | undefined): string {
    return this.selectedEvent?.modalities.find(m => m.id === modalityId)?.name || selectedUiText('routeCourse');
  }

  findModalityNameForEvent(event: RaceEvent, modalityId: number | null | undefined): string {
    return event.modalities.find(m => m.id === modalityId)?.name || selectedUiText('routeCourse');
  }

  canDeleteSelectedEvent(): boolean {
    const event = this.selectedEvent;
    return Boolean(event && event.createdBy === this.userId && event.tracks.length === 0);
  }

  deleteSelectedEvent(): void {
    if (!this.ensureEventsAccess()) return;
    const eventId = this.selectedEventId;
    if (!eventId || !this.selectedEvent) return;
    if (!this.canDeleteSelectedEvent()) {
      this.showMessage('Solo puedes eliminar eventos que hayas creado y que no tengan tracks asociados.');
      return;
    }

    this.eventService.removeEvent(eventId, this.userId).subscribe(removed => {
      if (removed) {
        this.handleEventSelection(null);
      }
    });
  }

  private async ensureLoadedTrackFromEventTrack(track: EventTrack, colorIndex: number): Promise<LoadedTrack | null> {
    try {
      let gpxData = track.gpxData
        || (track.gpxAsset ? await firstValueFrom(this.http.get(track.gpxAsset, { responseType: 'text' })) : null);

      if (!gpxData) {
        const gpxFile = await firstValueFrom(this.eventService.getTrackGpx(track.id));
        gpxData = gpxFile.routeXml ?? null;
        if (gpxFile.fileName) track.fileName = gpxFile.fileName;
      }

      if (!gpxData) return null;

      track.gpxData = gpxData;
      const fileName = track.fileName || track.nickname;

      const { track: loadedTrack } = this.parseGpxData(gpxData, fileName, colorIndex);
      loadedTrack.name = `${track.nickname} (${track.category})`;
      return loadedTrack;
    } catch {
      return null;
    }
  }


  private resolveTotalTimeSeconds(track: EventTrack): number {
    const tiempoReal = track.tiempoReal;
    if (tiempoReal !== undefined && tiempoReal !== null) {
      const parsed = Number(tiempoReal);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    const parsedDuration = this.parseLocalTimeToSeconds(track.duracionRecorrido);
    if (parsedDuration !== null) {
      return parsedDuration;
    }

    return this.toNumber(track.timeSeconds);
  }

  private resolveTrackYear(track: EventTrack, event?: RaceEvent): number {
    const trackYear = (track as any).year ?? (track as any).trackYear ?? track.year;
    if (trackYear !== undefined && trackYear !== null) {
      const parsedTrackYear = Number(trackYear);
      if (Number.isFinite(parsedTrackYear)) {
        return parsedTrackYear;
      }
    }

    const gpxYear = this.resolveTrackYearFromGpx(track.gpxData);
    if (gpxYear !== null) {
      return gpxYear;
    }

    if (event?.year) {
      return event.year;
    }
    const uploadedAt = track.uploadedAt;
    if (uploadedAt) {
      const parsed = new Date(uploadedAt);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.getFullYear();
      }
    }
    return 0;
  }

  private parseLocalTimeToSeconds(duration?: string | null): number | null {
    if (!duration) return null;
    const parts = duration.split(':').map(part => Number(part));
    if (parts.some(part => Number.isNaN(part))) return null;
    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      return hours * 3600 + minutes * 60 + seconds;
    }
    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return minutes * 60 + seconds;
    }
    return null;
  }

  private toNumber(value: any, fallback = 0): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  private toOptionalNumber(value: any): number | null {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private normalizeTrackText(value: any): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text || null;
  }
}
