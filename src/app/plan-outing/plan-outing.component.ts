import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, Subscription, catchError, debounceTime, firstValueFrom, forkJoin, map, of, switchMap, takeUntil } from 'rxjs';
import { RouteAnalysisService } from '../services/route-analysis.service';
import { InfoDialogComponent, InfoDialogData, InfoDialogResult } from '../info-dialog/info-dialog.component';
import {
  PlanService,
  PlanTrackImportPayload,
  RoundTripComplexity,
  RoundTripProfile,
  RoundTripRoutingMode,
  RoundTripRoutingPreferences
} from '../services/plan.service';
import { GpxImportService } from '../services/gpx-import.service';
import { InfoMessageService } from '../services/info-message.service';
import { MapPayloadTransferService } from '../services/map-payload-transfer.service';
import { UserIdentityService } from '../services/user-identity.service';
import { PlanFolder,  PlanFolderVotesResponse, PlanInvitation, PlanTrack, PlanTrackVotesSummary, PlanUserSearchResult, TrackWeatherSummary } from '../interfaces/plan';
import { LoginSuccessResponse } from '../interfaces/auth';
import { RoundTripOptionsDialogComponent, RoundTripOptionsDialogResult } from '../roundtrip-options-dialog/roundtrip-options-dialog.component';
import { environment } from 'src/environments/environment';
import * as L from 'leaflet';
import { calculateGpxElevation, ElevationResult } from '../utils/gpx-elevation';
import { RouteComparison, SavedRouteComparison } from '../interfaces/route-comparison';
import { RouteComparisonService } from '../services/route-comparison.service';
import { selectedUiText } from '../services/screen-texts';

type EditableFolder = {
  name: string;
  plannedDate: string | null;
  observations: string | null;
};

type ForecastResponse = {
  daily: {
    time: string[];
    weathercode: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
};

type PendingMessageUser = {
  name: string;
  nickname: string;
};

type PendingMessage = {
  id: number;
  user: PendingMessageUser | null;
  userMsg?: PendingMessageUser | null;
  mensaje: string;
  tipoMsg: number;
  estado: number;
  createdAt: string;
  idInvitacion?: number | null;
};

type InvitationMessagePayload = {
  userId: number;
  userMsgId: number;
  mensaje: string;
  tipoMsg: number;
  idInvitacion: number;
};

type Trkpt = { lat: number; lon: number; ele?: number };


type TrackDifficulty = {
  key: 'easy' | 'medium' | 'hard' | 'very-hard' | 'unknown';
  label: string;
  description: string;
};

type RoundTripProfileOption = {
  value: RoundTripProfile;
  label: string;
};

type RoundTripComplexityOption = {
  value: RoundTripComplexity;
  label: string;
};

type RoundTripRoutingModeOption = {
  value: RoundTripRoutingMode;
  label: string;
};

// Leaflet's automatic CSS URL detection does not resolve reliably after Angular bundles its CSS.
// Explicit assets also work when the map opens from a nested route such as /plan.
const roundTripMarkerIcon = L.icon({
  iconUrl: 'assets/leaflet/marker-icon.png',
  iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
  shadowUrl: 'assets/leaflet/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

@Component({
  selector: 'app-plan-outing',
  templateUrl: './plan-outing.component.html',
  styleUrls: ['./plan-outing.component.css', './planning-design.css']
})
export class PlanOutingComponent implements OnInit, OnDestroy {
  activePlanTab: 'tracks' | 'details' | 'guests' | 'reports' = 'tracks';
  private readonly trackElevationStatuses = new Map<number, ElevationResult['status']>();
  @ViewChild('trackInput') trackInput?: ElementRef<HTMLInputElement>;
  @ViewChild('roundTripMap') roundTripMapRef?: ElementRef<HTMLDivElement>;
  @ViewChild('detailsPanel') detailsPanelRef?: ElementRef<HTMLElement>;
  selectedSavedComparisonId: number | null = null;

  folders: PlanFolder[] = [];
  filteredFolders: PlanFolder[] = [];
  activeFolder: PlanFolder | null = null;
  editFolder: EditableFolder | null = null;
  private originalEditFolder: EditableFolder | null = null;
  tracks: PlanTrack[] = [];
  selectedTrackIds = new Set<number>();
  savedComparisons: SavedRouteComparison[] = [];
  votesByTrackId = new Map<number, number>();
  userVoteTrackId: number | null = null;
  weatherByTrackId = new Map<number, TrackWeatherSummary>();
  folderTrackCounts = new Map<number, number>();
  forecastNotice = '';
  forecastLoading = false;
  forecastUpdatedAt: Date | null = null;
  private forecastRequests = new Subscription();
  private trackLoadRequest?: Subscription;
  private analysisLoadRequest?: Subscription;
  readonly trackAnalysisIds = new Set<number>();

  readonly difficultyLegend: TrackDifficulty[] = [
    { key: 'easy', label: selectedUiText('soft'), description: selectedUiText('difficultyEasyHelp') },
    { key: 'medium', label: selectedUiText('mediumDifficulty'), description: selectedUiText('difficultyMediumHelp') },
    { key: 'hard', label: selectedUiText('hardDifficulty'), description: selectedUiText('difficultyHardHelp') },
    { key: 'very-hard', label: selectedUiText('veryHard'), description: selectedUiText('difficultyVeryHardHelp') },
    { key: 'unknown', label: selectedUiText('noData'), description: selectedUiText('difficultyUnknownHelp') }
  ];

  folderSearch = '';
  showNewFolderForm = false;
  newFolderName = '';
  newFolderDate: Date | null = null;
  newFolderNotes = '';

  inviteQuery = '';
  inviteStatusMessage = '';
  inviteSearchResults: PlanUserSearchResult[] = [];
  folderInvitations: PlanInvitation[] = [];
  sentInviteUserIds = new Set<number>();

  isLoadingFolders = false;
  isSavingFolder = false;
  isLoadingTracks = false;
  isImportingTrack = false;
  isLoadingPendingMessages = false;
  isGeneratingRoundTrip = false;
  showRoundTripMapOverlay = false;
  showPendingMessages = false;
  pendingMessages: PendingMessage[] = [];

  readonly roundTripProfileOptions: RoundTripProfileOption[] = [
    { value: 'cycling-regular', label: selectedUiText('gravelTrekking') },
    { value: 'cycling-road', label: 'Bici de carretera' },
    { value: 'cycling-mountain', label: 'Bici de montaña (MTB)' },
  ];

  readonly roundTripComplexityOptions: RoundTripComplexityOption[] = [
    { value: 'simple', label: selectedUiText('soft') },
    { value: 'medium', label: selectedUiText('moderate') },
    { value: 'technical', label: selectedUiText('demanding') }
  ];

  readonly roundTripRoutingModeOptions: RoundTripRoutingModeOption[] = [
    { value: 'balanced', label: selectedUiText('balanced') },
    { value: 'trails', label: selectedUiText('cyclingPaths') },
    { value: 'avoid-asphalt', label: selectedUiText('lessPavement') }
  ];

  roundTripProfile: RoundTripProfile = 'cycling-mountain';
  roundTripComplexity: RoundTripComplexity = 'simple';
  roundTripRoutingMode: RoundTripRoutingMode = 'trails';
  roundTripLengthKm = 35;
  roundTripStartLat: number | null = null;
  roundTripStartLon: number | null = null;

  private roundTripMap: L.Map | null = null;
  private roundTripMarker: L.Marker | null = null;
  private roundTripLine: L.Polyline | null = null;
  private roundTripLocationRequest = 0;
  isSavingRoundTrip = false;
  roundTripPreview: { payload: PlanTrackImportPayload; warnings: string[]; summary: string } | null = null;

  private readonly destroy$ = new Subject<void>();
  private readonly inviteSearch$ = new Subject<string>();
  private readonly userId: number;
  private requestedFolderId: number | null = null;

  constructor(
    private planService: PlanService,
    private http: HttpClient,
    private dialog: MatDialog,
    private gpxImportService: GpxImportService,
    private route: ActivatedRoute,
    private router: Router,
    private infoMessageService: InfoMessageService,
    private mapPayloadTransfer: MapPayloadTransferService,
    private routeComparisonService: RouteComparisonService,
    private routeAnalysisService: RouteAnalysisService,
    identityService: UserIdentityService
  ) {
    this.userId = identityService.getUserId();
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  ngOnInit(): void {
    this.requestedFolderId = this.parseFolderId(this.route.snapshot.queryParamMap.get('folderId'));
    this.loadFolders();
    this.loadPendingMessages();

    this.inviteSearch$
      .pipe(
        debounceTime(250),
        switchMap(query => this.planService.searchUsers(query)),
        takeUntil(this.destroy$)
      )
      .subscribe(response => {
        this.inviteSearchResults = response.users;
        this.inviteStatusMessage = response.notFound
          ? 'No se encuentra ningún usuario con ese nick o email.'
          : (response.users.length ? '' : (this.inviteQuery ? 'No se encontraron usuarios.' : ''));
      });
  }

  ngOnDestroy(): void {
    this.forecastRequests.unsubscribe();
    this.trackLoadRequest?.unsubscribe();
    this.analysisLoadRequest?.unsubscribe();
    this.closeRoundTripMapOverlay();
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadFolders(): void {
    this.isLoadingFolders = true;
    this.planService.getFolders().subscribe(folders => {
      this.folders = folders;
      this.folderTrackCounts.clear();
      folders.forEach(folder => {
        if (Number.isFinite(folder.tracksCount ?? NaN)) {
          this.folderTrackCounts.set(folder.id, Number(folder.tracksCount));
        }
      });
      this.preloadMissingFolderTrackCounts(folders);
      this.applyFolderFilter();
      const requestedFolder = this.requestedFolderId
        ? folders.find(folder => folder.id === this.requestedFolderId)
        : null;
      if (requestedFolder) {
        this.selectFolder(requestedFolder);
        this.requestedFolderId = null;
      } else if (!this.activeFolder && folders.length) {
        this.selectFolder(folders[0]);
      }
      this.isLoadingFolders = false;
    });
  }

  loadPendingMessages(): void {
    if (!this.userId) {
      this.pendingMessages = [];
      this.isLoadingPendingMessages = false;
      return;
    }

    this.isLoadingPendingMessages = true;
    this.http
      .get<PendingMessage[]>(`${environment.mensajesApiBase}/usuario/${this.userId}/pendientes`)
      .subscribe({ 
        next: response => {
          this.pendingMessages = response ?? [];
          this.isLoadingPendingMessages = false;
        },
        error: () => {
          this.pendingMessages = [];
          this.isLoadingPendingMessages = false;
        }
      });
  }

  togglePendingMessages(): void {
    this.showPendingMessages = !this.showPendingMessages;
  }

  formatPendingMessageIntro(message: PendingMessage): string {
    const sender = message.userMsg ?? message.user;
    const nickname = sender?.nickname ?? 'un usuario';
    const subject = message.tipoMsg === 1 ? 'la siguiente invitación' : 'el siguiente mensaje';
    return `El usuario ${nickname} te envía ${subject}`;
  }

  markMessageAsSeen(message: PendingMessage): void {
    this.http.delete(`${environment.mensajesApiBase}/${message.id}`).subscribe(() => {
      this.pendingMessages = this.pendingMessages.filter(item => item.id !== message.id);
    });
  }

  updateMessageStatus(message: PendingMessage, estado: number): void {
    const requests: Array<Observable<unknown>> = [
      this.http.put(`${environment.mensajesApiBase}/${message.id}/estado`, { estado })
    ];
    if (message.tipoMsg === 1 && message.idInvitacion) {
      const memberStatus = estado === 1 ? 'accepted' : 'rejected';
      requests.push(this.planService.updateMemberStatus({ id: message.idInvitacion, status: memberStatus }));
    }
    forkJoin(requests).subscribe(() => {
      this.pendingMessages = this.pendingMessages.filter(item => item.id !== message.id);
      if (message.tipoMsg === 1 && estado === 1) {
        this.loadFolders();
      }
    });
  }

  applyFolderFilter(): void {
    const search = (this.folderSearch ?? '').trim().toLowerCase();

    this.filteredFolders = (this.folders ?? []).filter(folder =>
      (folder?.name ?? '').toLowerCase().includes(search)
    );
  }


  async toggleNewFolderForm(): Promise<void> {
    if (!this.showNewFolderForm) {
      const canContinue = await this.confirmDiscardUnsavedChanges();
      if (!canContinue) return;
    }

    this.showNewFolderForm = !this.showNewFolderForm;
  }

  createFolder(): void {
    const sanitizedName = this.newFolderName.trim();
    if (!sanitizedName) {
      this.showMessage('Añade un nombre para crear la carpeta.');
      return;
    }

    const sanitizedDate = this.formatDateForApi(this.newFolderDate);
    const sanitizedObservations = this.newFolderNotes.trim() || null;

    this.planService
      .createFolder({
        name: sanitizedName,
        plannedDate: sanitizedDate,
        observations: sanitizedObservations
      })
      .subscribe(folder => {
        const resolvedFolder = this.applyNewFolderOwnership({
          ...folder,
          name: folder.name?.trim() ? folder.name : sanitizedName,
          plannedDate: folder.plannedDate ?? sanitizedDate,
          observations: folder.observations ?? sanitizedObservations
        });
        this.folders = [resolvedFolder, ...this.folders];
        this.folderTrackCounts.set(resolvedFolder.id, 0);
        this.applyFolderFilter();
        this.selectFolder(resolvedFolder);
        this.newFolderName = '';
        this.newFolderDate = null;
        this.newFolderNotes = '';
        this.showNewFolderForm = false;
      });
  }

  async onFolderCardClick(folder: PlanFolder): Promise<void> {
    if (this.activeFolder?.id === folder.id) { this.showTracksTab(); return; }
    const canContinue = await this.confirmDiscardUnsavedChanges();
    if (!canContinue) return;
    this.selectFolder(folder);
  }

  get hasFolderChanges(): boolean {
    if (!this.editFolder || !this.originalEditFolder) return false;

    return this.normalizeEditableField(this.editFolder.name) !== this.normalizeEditableField(this.originalEditFolder.name)
      || this.normalizeEditableField(this.editFolder.plannedDate) !== this.normalizeEditableField(this.originalEditFolder.plannedDate)
      || this.normalizeEditableField(this.editFolder.observations) !== this.normalizeEditableField(this.originalEditFolder.observations);
  }

  private async confirmDiscardUnsavedChanges(): Promise<boolean> {
    if (!this.hasFolderChanges) return true;

    const decision = await this.openInfoDialog({
      title: 'Cambios sin guardar',
      message: 'No se han guardado los cambios y, si continúas, se perderán. ¿Deseas continuar?',
      confirmLabel: selectedUiText('continue'),
      cancelLabel: 'Seguir editando'
    });

    return decision === 'confirm';
  }

  selectFolder(folder: PlanFolder, shouldScrollToDetails = false): void {
    this.activeFolder = folder;
    this.activePlanTab = 'tracks';
    this.selectedSavedComparisonId = null;
    this.editFolder = {
      name: folder.name,
      plannedDate: this.toDateValue(folder.plannedDate),
      observations: folder.observations
    };
    this.originalEditFolder = { ...this.editFolder };
    this.loadTracks(folder.id);
    this.loadInvitations(folder.id);
    this.inviteSearchResults = [];
    this.inviteStatusMessage = '';
    if (shouldScrollToDetails) {
      this.scrollToDetailsOnMobile();
    }
  }

  showTracksTab(): void {
    this.activePlanTab = 'tracks';
    if (!this.isLoadingTracks) this.refreshForecasts();
  }

  @HostListener('document:visibilitychange')
  refreshForecastsOnReturn(): void {
    if (!document.hidden && this.activeFolder && !this.isLoadingTracks) this.refreshForecasts();
  }

  private scrollToDetailsOnMobile(): void {
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 768px)').matches) {
      return;
    }

    requestAnimationFrame(() => {
      this.detailsPanelRef?.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  }

  saveFolder(): void {
    if (!this.activeFolder || !this.editFolder) return;
    if (!this.editFolder.name.trim()) {
      this.showMessage('El nombre de la carpeta es obligatorio.');
      return;
    }

    const sanitizedName = this.editFolder.name.trim();
    const sanitizedDate = this.formatDateForApi(this.editFolder.plannedDate);
    const sanitizedObservations = this.editFolder.observations?.trim() || null;

    this.isSavingFolder = true;
    this.planService
      .updateFolder(this.activeFolder.id, {
        name: sanitizedName,
        plannedDate: sanitizedDate,
        observations: sanitizedObservations
      })
      .subscribe(updated => {
        const resolvedOwnerId = this.resolveUpdatedOwnerId(updated);
        const resolvedIsOwner = this.resolveUpdatedIsOwner(updated, resolvedOwnerId);
        const mergedFolder: PlanFolder = {
          ...this.activeFolder,
          ...updated,
          ownerId: resolvedOwnerId,
          isOwner: resolvedIsOwner,
          name: updated.name ?? sanitizedName,
          plannedDate: updated.plannedDate ?? sanitizedDate,
          observations: updated.observations ?? sanitizedObservations
        };
        this.folders = this.folders.map(folder => (folder.id === mergedFolder.id ? mergedFolder : folder));
        this.applyFolderFilter();
        this.activeFolder = mergedFolder;
        this.editFolder = {
          name: mergedFolder.name,
          plannedDate: this.toDateValue(mergedFolder.plannedDate),
          observations: mergedFolder.observations
        };
        this.originalEditFolder = { ...this.editFolder };
        this.isSavingFolder = false;
        this.refreshForecasts();
      });
  }

  async confirmDeleteFolder(folder: PlanFolder): Promise<void> {
    const decision = await this.openInfoDialog({
      title: selectedUiText('deleteFolder'),
      message: selectedUiText('deleteOutingPrompt').replace('{name}', () => folder.name),
      confirmLabel: selectedUiText('delete'),
      cancelLabel: selectedUiText('cancel')
    });

    if (decision !== 'confirm') return;
    this.planService.deleteFolder(folder.id).subscribe({ next: () => {
      this.folders = this.folders.filter(current => current.id !== folder.id);
      this.folderTrackCounts.delete(folder.id);
      this.applyFolderFilter();
      if (this.activeFolder?.id === folder.id) {
        this.activeFolder = null;
        this.editFolder = null;
        this.originalEditFolder = null;
        this.tracks = [];
        this.clearTrackSelection();
        this.votesByTrackId.clear();
        this.userVoteTrackId = null;
      }
      if (this.folders.length) {
        this.selectFolder(this.folders[0]);
      }
    }, error: () => this.showMessage(selectedUiText('deleteOutingError'), selectedUiText('noticeTitle')) });
  }

  async confirmDeleteTrack(track: PlanTrack): Promise<void> {
    if (!this.activeFolder) return;
    if (!this.canDeleteTracks()) {
      this.showMessage('Solo el propietario de la carpeta puede eliminar tracks compartidos.');
      return;
    }
    const decision = await this.openInfoDialog({
      title: selectedUiText('deleteTrack'),
      message: selectedUiText('deleteTrackPrompt').replace('{name}', () => track.name),
      confirmLabel: selectedUiText('delete'),
      cancelLabel: selectedUiText('cancel')
    });

    if (decision !== 'confirm') return;
    this.planService.deleteTrack(track.id).subscribe({ next: () => {
      this.tracks = this.tracks.filter(current => current.id !== track.id);
      this.savedComparisons = this.savedComparisons.filter(report => report.trackAId !== track.id && report.trackBId !== track.id);
      this.selectedTrackIds.delete(track.id);
      this.votesByTrackId.delete(track.id);
      if (this.userVoteTrackId === track.id) {
        this.userVoteTrackId = null;
      }
      this.updateActiveFolderTrackCount(-1);
      this.refreshForecasts();
    }, error: () => this.showMessage(selectedUiText('deleteTrackError'), selectedUiText('noticeTitle')) });
  }

  loadTracks(folderId: number): void {
    this.trackLoadRequest?.unsubscribe();
    this.analysisLoadRequest?.unsubscribe();
    this.trackAnalysisIds.clear();
    this.resetForecasts();
    this.isLoadingTracks = true;
    this.loadSavedComparisons(folderId);
    this.trackLoadRequest = this.planService.getTracks(folderId).pipe(
      switchMap(tracks => {
        this.tracks = tracks.map(track => this.ensureTrackDifficulty(track));
        this.loadTrackAnalyses(folderId, tracks);
        this.clearTrackSelection();
        this.updateFolderTrackCountCache(folderId, tracks.length);
        this.refreshForecasts();
        if (!tracks.length) {
          this.votesByTrackId.clear();
          this.userVoteTrackId = null;
          return of([]);
        }
        return forkJoin(tracks.map(track => this.planService.getTrackVotesSummary(track.id)));
      }), takeUntil(this.destroy$)
    ).subscribe(summaries => {
      if (summaries.length) {
        this.applyTrackVotesSummary(summaries);
      }
      this.isLoadingTracks = false;
    });
  }

  loadVotes(folderId: number): void {
    this.planService.getVotes(folderId).subscribe(response => {
      this.applyVotes(response);
    });
  }

  private loadTrackAnalyses(folderId: number, tracks: PlanTrack[]): void {
    this.analysisLoadRequest = forkJoin(tracks.map(track =>
      this.routeAnalysisService.getTrackAnalysis(track.id, 'plan').pipe(
        catchError(() => of(null)),
        map(analysis => analysis?.id ? track.id : null)
      )
    )).pipe(takeUntil(this.destroy$)).subscribe(ids => {
      if (this.activeFolder?.id !== folderId) return;
      this.trackAnalysisIds.clear();
      ids.forEach(id => { if (id !== null) this.trackAnalysisIds.add(id); });
    });
  }

  onTrackImportClick(): void {
    this.trackInput?.nativeElement?.click();
  }

  openRoundTripOptionsDialog(): void {
    if (!this.activeFolder) {
      this.showMessage('Selecciona una salida antes de generar una ruta.');
      return;
    }

    const dialogRef = this.dialog.open<
      RoundTripOptionsDialogComponent,
      {
        profile: RoundTripProfile;
        complexity: RoundTripComplexity;
        routingMode: RoundTripRoutingMode;
        lengthKm: number;
        profileOptions: RoundTripProfileOption[];
        complexityOptions: RoundTripComplexityOption[];
        routingModeOptions: RoundTripRoutingModeOption[];
      },
      RoundTripOptionsDialogResult | undefined
    >(RoundTripOptionsDialogComponent, {
      width: '520px',
      maxWidth: '96vw',
      autoFocus: false,
      panelClass: 'tracketeo-playback-dialog',
      data: {
        profile: this.roundTripProfile,
        complexity: this.roundTripComplexity,
        routingMode: this.roundTripRoutingMode,
        lengthKm: this.roundTripLengthKm,
        profileOptions: this.roundTripProfileOptions,
        complexityOptions: this.roundTripComplexityOptions,
        routingModeOptions: this.roundTripRoutingModeOptions
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (!result) return;
      this.roundTripProfile = result.profile;
      this.roundTripComplexity = result.complexity;
      this.roundTripRoutingMode = result.routingMode;
      this.roundTripLengthKm = Number(result.lengthKm);
      this.openRoundTripMapOverlay();
    });
  }

  closeRoundTripMapOverlay(): void {
    this.roundTripLocationRequest++;
    this.showRoundTripMapOverlay = false;
    this.roundTripPreview = null;
    this.destroyRoundTripMap();
  }

  private openRoundTripMapOverlay(): void {
    this.roundTripPreview = null;
    this.roundTripStartLat = null;
    this.roundTripStartLon = null;
    this.showRoundTripMapOverlay = true;
    this.requestRoundTripUserLocation();
    setTimeout(() => this.initializeRoundTripMap(), 0);
  }

  private destroyRoundTripMap(): void {
    if (this.roundTripMap) {
      this.roundTripMap.remove();
    }
    this.roundTripMap = null;
    this.roundTripMarker = null;
    this.roundTripLine = null;
  }

  private requestRoundTripUserLocation(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }
    const requestId = ++this.roundTripLocationRequest;
    navigator.geolocation.getCurrentPosition(
      position => {
        if (!this.showRoundTripMapOverlay || requestId !== this.roundTripLocationRequest) return;
        this.roundTripStartLat = Number(position.coords.latitude.toFixed(6));
        this.roundTripStartLon = Number(position.coords.longitude.toFixed(6));
        this.placeRoundTripMarker();
      },
      () => { /* The map remains available to select a start manually. */ },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 120000 }
    );
  }

  async generateRoundTripRoute(): Promise<void> {
    if (this.isGeneratingRoundTrip || this.isSavingRoundTrip) return;
    if (!this.activeFolder) {
      this.showMessage('Selecciona una salida antes de generar una ruta.');
      return;
    }
    if (!Number.isFinite(this.roundTripStartLat) || !Number.isFinite(this.roundTripStartLon)) {
      this.showMessage('Selecciona el punto de salida haciendo clic en el mapa.');
      return;
    }
    if (!Number.isFinite(this.roundTripLengthKm) || this.roundTripLengthKm < 5 || this.roundTripLengthKm > 200) {
      this.showMessage('La longitud debe estar entre 5 km y 200 km.');
      return;
    }

    this.isGeneratingRoundTrip = true;
    this.roundTripLocationRequest++;
    const folderId = this.activeFolder.id;
    this.roundTripPreview = null;
    this.roundTripLine?.remove();
    try {
      const response = await firstValueFrom(this.planService.generateRoundTripRoute({
        profile: this.roundTripProfile,
        complexity: this.roundTripComplexity,
        preferences: this.buildRoundTripRoutingPreferences(),
        lengthKm: this.roundTripLengthKm,
        start: {
          lat: Number(this.roundTripStartLat),
          lon: Number(this.roundTripStartLon)
        }
      }));
      if (!this.showRoundTripMapOverlay) return;

      const coordinates = response?.geometry?.coordinates ?? [];
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        this.showMessage('No se pudo generar una geometría de ruta válida.');
        return;
      }

      const trkpts = coordinates
        .map(([lon, lat, ele]) => ({ lat, lon, ele: typeof ele === 'number' && Number.isFinite(ele) ? ele : undefined }));

      if (trkpts.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180)) {
        this.showMessage('La ruta generada contiene coordenadas no válidas. Prueba otra propuesta.');
        return;
      }

      const routeName = `Circular ${this.resolveRoundTripProfileLabel(this.roundTripProfile)}`;
      const gpxData = this.buildGpxFromTrackPoints(trkpts, routeName);
      const elevation = calculateGpxElevation(gpxData);
      const difficulty = this.calculateTrackDifficultyMetrics(
        elevation.distanceKm,
        elevation.gain,
        response.durationSeconds
      );

      const payload: PlanTrackImportPayload = {
        folder_id: folderId,
        created_by_user_id: this.userId,
        name: `${routeName} · ${elevation.distanceKm.toFixed(1)} km.gpx`,
        start_lat: trkpts[0].lat,
        start_lon: trkpts[0].lon,
        start_population: 'Ruta circular generada',
        distance_km: elevation.distanceKm,
        moving_time_sec: Number.isFinite(response.durationSeconds) ? Number(response.durationSeconds) : null,
        total_time_sec: Number.isFinite(response.durationSeconds) ? Number(response.durationSeconds) : null,
        desnivel: elevation.gain,
        difficulty_score: difficulty.score,
        difficulty_level: difficulty.level,
        difficulty_version: 1,
        route_xml: gpxData
      };

      const warnings = [...(response.warnings ?? [])];
      if (response.fallbackLevel && !warnings.length) warnings.push('El motor ha relajado preferencias para encontrar una ruta.');
      const quality = response.appliedOptions?.traceability;
      const terrain = quality && Number.isFinite(quality.roadPercent) && Number.isFinite(quality.trackCyclewayPercent)
        ? ` · ${quality.trackCyclewayPercent}% pistas/vías ciclistas · ${quality.roadPercent}% carreteras` : '';
      this.roundTripPreview = { payload, warnings,
        summary: `${elevation.distanceKm.toFixed(1)} km · ${this.formatDesnivel(elevation.gain)} de ascenso${terrain}` };
      if (this.roundTripMap) {
        this.roundTripLine = L.polyline(trkpts.map(p => [p.lat, p.lon] as L.LatLngTuple), { color: '#d97706', weight: 5 }).addTo(this.roundTripMap);
        this.roundTripMap.fitBounds(this.roundTripLine.getBounds(), { padding: [24, 24] });
      }
    } catch (error) {
      const code = (error as { error?: { code?: string; errorCode?: string } })?.error;
      const messages: Record<string, string> = {
        NO_SUITABLE_ROUND_TRIP: 'No se ha encontrado una circular adecuada. Prueba otra distancia o mueve el punto de inicio.',
        BROUTER_DATA_PREPARING: 'El servidor está descargando el mapa de rutas. Espera unos minutos y vuelve a pulsar Generar propuesta.',
        BROUTER_DATA_MISSING: 'El servidor todavía no tiene los mapas de rutas de esta zona. Hay que añadir esa cobertura para generar la circular.',
        BROUTER_UPSTREAM_ERROR: 'El motor de rutas no está disponible. No es un problema del punto de inicio ni de las opciones elegidas.'
      };
      this.showMessage(messages[code?.code ?? code?.errorCode ?? '']
        ?? 'No se pudo generar la ruta circular. Inténtalo de nuevo en unos momentos.');
    } finally {
      this.isGeneratingRoundTrip = false;
    }
  }

  async saveRoundTripRoute(): Promise<void> {
    if (!this.roundTripPreview || this.isSavingRoundTrip || this.isGeneratingRoundTrip) return;
    const payload = this.roundTripPreview.payload;
    this.isSavingRoundTrip = true;
    try {
      const createdTrack = await firstValueFrom(this.planService.importTrack(payload));
      if (this.activeFolder?.id === payload.folder_id) {
        this.tracks = [...this.tracks, this.mergeTrackWithPayload(createdTrack, payload)];
        this.updateActiveFolderTrackCount(1);
        this.refreshForecasts();
      }
      this.closeRoundTripMapOverlay();
      this.showMessage('Ruta circular guardada en la salida.');
    } catch {
      this.showMessage('No se pudo guardar la ruta. La propuesta sigue disponible para reintentarlo.');
    } finally { this.isSavingRoundTrip = false; }
  }

  private initializeRoundTripMap(): void {
    const mapHost = this.roundTripMapRef?.nativeElement;
    if (!mapHost) return;

    if (!this.roundTripMap) {
      this.roundTripMap = L.map(mapHost, {
        center: [40.4168, -3.7038],
        zoom: 6,
        zoomControl: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(this.roundTripMap);

      this.roundTripMap.on('click', (event: L.LeafletMouseEvent) => {
        if (this.isGeneratingRoundTrip || this.isSavingRoundTrip) {
          return;
        }
        this.roundTripLocationRequest++;
        this.roundTripPreview = null;
        this.roundTripLine?.remove();
        this.roundTripStartLat = Number(event.latlng.lat.toFixed(6));
        this.roundTripStartLon = Number(event.latlng.lng.toFixed(6));
        this.placeRoundTripMarker();
      });
    }

    this.roundTripMap.invalidateSize();
    this.placeRoundTripMarker();
  }

  private placeRoundTripMarker(): void {
    if (!this.roundTripMap || !Number.isFinite(this.roundTripStartLat) || !Number.isFinite(this.roundTripStartLon)) {
      return;
    }
    const latLng: L.LatLngExpression = [Number(this.roundTripStartLat), Number(this.roundTripStartLon)];
    if (!this.roundTripMarker) {
      this.roundTripMarker = L.marker(latLng, { icon: roundTripMarkerIcon }).addTo(this.roundTripMap);
    } else {
      this.roundTripMarker.setLatLng(latLng);
    }
    this.roundTripMap.setView(latLng, Math.max(this.roundTripMap.getZoom(), 11));
  }

  private resolveRoundTripProfileLabel(profile: RoundTripProfile): string {
    return this.roundTripProfileOptions.find(option => option.value === profile)?.label ?? profile;
  }

  private buildRoundTripRoutingPreferences(): RoundTripRoutingPreferences {
    return {
      mode: this.roundTripProfile === 'cycling-road' ? 'balanced' : this.roundTripRoutingMode,
      avoidFeatures: ['steps'],
      extraInfo: ['surface', 'waytype']
    };
  }

  async onTrackFileSelected(event: Event): Promise<void> {
    if (!this.activeFolder) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.gpx')) {
      this.showMessage('Selecciona un archivo GPX válido.');
      if (input) input.value = '';
      return;
    }

    this.isImportingTrack = true;
    try {
      const payload = await this.buildTrackImportPayload(this.activeFolder.id, file);
      if (!payload) {
        this.isImportingTrack = false;
        if (input) input.value = '';
        return;
      }
      this.planService.importTrack(payload).subscribe(track => {
        const mergedTrack = this.mergeTrackWithPayload(track, payload);
        this.tracks = [...this.tracks, mergedTrack];
        this.updateActiveFolderTrackCount(1);
        this.isImportingTrack = false;
        this.refreshForecasts();
        if (input) input.value = '';
      });
    } catch {
      this.isImportingTrack = false;
      this.showMessage('No se pudo preparar el track para importar.');
      if (input) input.value = '';
    }
  }

  searchInvite(): void {
    this.inviteSearchResults = [];
    this.inviteSearch$.next(this.inviteQuery.trim());
  }

  inviteUser(user: PlanUserSearchResult): void {
    if (!this.activeFolder) return;

    this.planService
      .inviteUser(this.activeFolder.id, {
        folderId: this.activeFolder.id,
        userId: user.id,
        email: user.email,
        nickname: this.resolveInviteNickname(user)
      })
      .subscribe({
        next: () => {
          this.sentInviteUserIds.add(user.id);
          this.inviteStatusMessage = `Invitación enviada a ${this.resolveInviteNickname(user)}.`;
          this.inviteSearchResults = [];
          this.loadInvitations(this.activeFolder?.id ?? 0);
        },
        error: () => {
          this.sentInviteUserIds.delete(user.id);
          this.inviteStatusMessage = `No se pudo enviar la invitación a ${this.resolveInviteNickname(user)}.`;
        }
      });
  }

  revokeInvite(user: PlanUserSearchResult): void {
    if (!this.activeFolder) return;
    const invitation = this.resolveInvitation(user);
    if (!invitation) return;

    this.planService.revokeInvitation(this.activeFolder.id, invitation.id).subscribe(() => {
      this.inviteStatusMessage = `Invitación revocada para ${this.resolveInviteNickname(user)}.`;
      this.loadInvitations(this.activeFolder?.id ?? 0);
    });
  }

  async removeInvitation(invitation: PlanInvitation): Promise<void> {
    if (!this.activeFolder) return;

    const userId = invitation.invitedUserId ?? invitation.userId;
    if (!userId) {
      this.showMessage('No se pudo quitar el acceso porque falta el usuario.');
      return;
    }
    const confirmResult = await this.openInfoDialog({
      title: 'Confirmar acción',
      message: 'Se quitará el acceso de este usuario a la carpeta. ¿Quieres continuar?',
      confirmLabel: 'Quitar acceso',
      cancelLabel: selectedUiText('cancel')
    });
    if (confirmResult !== 'confirm') return;

    this.planService.removeFolderMember(this.activeFolder.id, userId).subscribe(() => {
      this.inviteStatusMessage = `Se quitó el acceso de ${this.resolveInvitationLabel(invitation)}.`;
      this.loadInvitations(this.activeFolder?.id ?? 0);
    });
  }

  resolveInviteNickname(user: PlanUserSearchResult): string {
    const nickname = user.name?.trim();
    return nickname ? nickname : 'Sin nick';
  }

  resolveInviteSecondary(user: PlanUserSearchResult): string | null {
    const email = user.email?.trim();
    if (!email) return null;
    return this.obfuscateEmail(email);
  }

  resolveInviteStatus(user: PlanUserSearchResult): string {
    const invitation = this.resolveInvitation(user);

    if (!invitation) return this.sentInviteUserIds.has(user.id) ? selectedUiText('invitationSent') : selectedUiText('invitationUnsent');
    const statusMap: Record<string, string> = {
      accepted: selectedUiText('invitationAccepted'),
      pending: selectedUiText('invitationPending'),
      sending: selectedUiText('invitationSending'),
      declined: selectedUiText('invitationRejected'),
      rejected: selectedUiText('invitationRejected'),
      rejeted: selectedUiText('invitationRejected'),
      revoked: selectedUiText('invitationRevoked'),
      expired: selectedUiText('invitationExpired')
    };
    return statusMap[invitation.status] ?? selectedUiText('invitationPending');
  }

  canSendInvite(user: PlanUserSearchResult): boolean {
    if (this.sentInviteUserIds.has(user.id)) return false;
    const invitation = this.resolveInvitation(user);
    if (!invitation) return true;
    return this.isRejectedStatus(invitation.status) || ['revoked', 'expired'].includes(invitation.status);
  }

  resolveInviteActionLabel(user: PlanUserSearchResult): string {
    const invitation = this.resolveInvitation(user);
    if (invitation && this.isRejectedStatus(invitation.status)) {
      return selectedUiText('invitationRejected');
    }
    return this.canSendInvite(user) ? selectedUiText('sendInvitation') : selectedUiText('invitationSent');
  }

  toggleVote(track: PlanTrack): void {
    if (!this.activeFolder) return;

    const action$ = this.userVoteTrackId === track.id
      ? this.planService.removeVote(this.activeFolder.id, track.id)
      : this.planService.voteTrack(this.activeFolder.id, track.id);

    action$
      .pipe(switchMap(() => this.refreshTrackVotesSummary()))
      .subscribe(summaries => {
        if (summaries.length) {
          this.applyTrackVotesSummary(summaries);
        } else {
          this.votesByTrackId.clear();
          this.userVoteTrackId = null;
        }
      });
  }

  resolveVoteLabel(track: PlanTrack): string {
    return this.userVoteTrackId === track.id ? selectedUiText('removeVote') : selectedUiText('vote');
  }

  resolveWeatherLabel(trackId: number): string {
    const summary = this.weatherByTrackId.get(trackId);
    if (!summary) return '—';
    return `${this.mapWeatherCode(summary.weatherCode)} · ${summary.minTemp}°/${summary.maxTemp}°`;
  }

  resolveWeatherHint(trackId: number): string {
    const summary = this.weatherByTrackId.get(trackId);
    if (!summary) return this.forecastLoading ? selectedUiText('updatingForecast') : this.forecastNotice || selectedUiText('noForecastAvailable');
    return `Predicción ${summary.date}`;
  }

  resolveWeatherIcon(trackId: number): string {
    const summary = this.weatherByTrackId.get(trackId);
    if (!summary) return '—';
    return this.mapWeatherIcon(summary.weatherCode);
  }

  resolveWeatherCategory(trackId: number): string {
    const summary = this.weatherByTrackId.get(trackId);
    if (!summary) return selectedUiText('noData');
    return this.mapWeatherCategory(summary.weatherCode);
  }

  resolveWeatherTemperature(trackId: number): string {
    const summary = this.weatherByTrackId.get(trackId);
    if (!summary) return this.forecastLoading ? selectedUiText('updating') : selectedUiText('noForecast');
    return `${summary.minTemp}°/${summary.maxTemp}°`;
  }

  resolveMapsLink(track: PlanTrack): string | null {
    if (track.startLat === null || track.startLon === null) return null;
    return `https://www.google.com/maps/search/?api=1&query=${track.startLat},${track.startLon}`;
  }

  resolveFolderTrackCount(folder: PlanFolder): number {
    if (Number.isFinite(folder.tracksCount ?? NaN)) {
      return Number(folder.tracksCount);
    }

    const cachedCount = this.folderTrackCounts.get(folder.id);
    if (cachedCount !== undefined) {
      return cachedCount;
    }

    if (this.activeFolder?.id === folder.id) {
      return this.tracks.length;
    }

    return 0;
  }

  resolveFolderTrackLabel(folder: PlanFolder): string {
    const count = this.resolveFolderTrackCount(folder);
    return `${count} ${count === 1 ? 'track' : 'tracks'}`;
  }

  resolveFolderVisibility(folder: PlanFolder): string {
    if (folder.shared !== undefined) {
      return folder.shared ? selectedUiText('sharedOuting') : selectedUiText('privateOuting');
    }

    return folder.ownerId !== this.userId ? selectedUiText('sharedOuting') : selectedUiText('privateOuting');
  }

  isFolderOwner(folder: PlanFolder): boolean {
    if (folder.isOwner !== undefined) {
      return folder.isOwner;
    }
    return folder.ownerId === this.userId;
  }

  canDeleteTracks(): boolean {
    if (!this.activeFolder) return false;
    return this.isFolderOwner(this.activeFolder);
  }

  canManageInvitations(): boolean {
    if (!this.activeFolder) return false;
    return this.isFolderOwner(this.activeFolder);
  }

  formatDistance(distance: number | null): string {
    if (!distance) return '—';
    return `${distance.toFixed(1)} km`;
  }

  formatDuration(seconds: number | null): string {
    if (!seconds) return '—';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  formatDesnivel(desnivel: number | null): string {
    if (desnivel === null || desnivel === undefined || !Number.isFinite(desnivel)) {
      return selectedUiText('noElevation');
    }
    return `${Math.round(desnivel)} m`;
  }


  getTrackDifficulty(track: PlanTrack): TrackDifficulty {
    const level = Number(track.difficultyLevel);
    if (Number.isFinite(level)) {
      if (level === 1) return this.difficultyLegend.find(item => item.key === 'easy')!;
      if (level === 2) return this.difficultyLegend.find(item => item.key === 'medium')!;
      if (level === 3) return this.difficultyLegend.find(item => item.key === 'hard')!;
      if (level === 4) return this.difficultyLegend.find(item => item.key === 'very-hard')!;
    }

    return this.difficultyLegend.find(item => item.key === 'unknown')!;
  }

  canVoteOnTracks(): boolean {
    return !!this.activeFolder && this.tracks.length > 1;
  }

  private preloadMissingFolderTrackCounts(folders: PlanFolder[]): void {
    const missingFolders = folders.filter(folder => !this.folderTrackCounts.has(folder.id));
    if (!missingFolders.length) {
      return;
    }

    forkJoin(
      missingFolders.map(folder =>
        this.planService.getTracks(folder.id).pipe(
          map(tracks => ({ folderId: folder.id, count: tracks.length }))
        )
      )
    ).subscribe(results => {
      results.forEach(({ folderId, count }) => {
        this.folderTrackCounts.set(folderId, count);
      });
    });
  }

  canViewTrack(track: PlanTrack): boolean {
    return !!track.routeXml;
  }

  private applyNewFolderOwnership(folder: PlanFolder): PlanFolder {
    const resolvedOwnerId = Number.isFinite(folder.ownerId) && folder.ownerId > 0 ? folder.ownerId : this.userId;
    const resolvedIsOwner = folder.isOwner ?? resolvedOwnerId === this.userId;
    return {
      ...folder,
      ownerId: resolvedOwnerId,
      isOwner: resolvedIsOwner
    };
  }

  private resolveUpdatedOwnerId(updated: PlanFolder): number {
    if (Number.isFinite(updated.ownerId) && updated.ownerId > 0) {
      return updated.ownerId;
    }
    if (this.activeFolder?.ownerId && this.activeFolder.ownerId > 0) {
      return this.activeFolder.ownerId;
    }
    if (this.activeFolder?.isOwner) {
      return this.userId;
    }
    return 0;
  }

  private resolveUpdatedIsOwner(updated: PlanFolder, ownerId: number): boolean {
    if (updated.isOwner !== undefined) {
      return updated.isOwner;
    }
    if (this.activeFolder?.isOwner !== undefined) {
      return this.activeFolder.isOwner;
    }
    if (ownerId > 0) {
      return ownerId === this.userId;
    }
    return false;
  }

  get hasSelectedTracks(): boolean {
    return this.selectedTrackIds.size > 0;
  }

  get comparisonTracks(): PlanTrack[] {
    return this.tracks.filter(track => this.selectedTrackIds.has(track.id));
  }

  onComparisonCalculated(report: RouteComparison): void {
    for (const route of report.routes) {
      const track = this.tracks.find(item => item.id === route.id);
      if (track) {
        track.irpScore = route.metrics.irp;
        track.irpVersion = route.metrics.irp === null ? null : route.metrics.version;
      }
    }
    if (this.activeFolder?.id) this.loadSavedComparisons(this.activeFolder.id);
  }

  openSavedComparison(id: number): void {
    this.activePlanTab = 'reports';
    this.selectedSavedComparisonId = id;
  }

  private loadSavedComparisons(folderId: number): void {
    this.savedComparisons = [];
    this.routeComparisonService.list(folderId).subscribe({
      next: reports => { if (this.activeFolder?.id === folderId) this.savedComparisons = reports; },
      error: () => { if (this.activeFolder?.id === folderId) this.savedComparisons = []; }
    });
  }

  get hasSelectableTracks(): boolean {
    return this.getSelectableTracks().length > 0;
  }

  get allSelectableTracksSelected(): boolean {
    const selectable = this.getSelectableTracks();
    return selectable.length > 0 && selectable.every(track => this.selectedTrackIds.has(track.id));
  }

  toggleAllTracksSelection(checked: boolean): void {
    const selectable = this.getSelectableTracks();
    if (!selectable.length) return;
    if (checked) {
      selectable.forEach(track => this.selectedTrackIds.add(track.id));
    } else {
      selectable.forEach(track => this.selectedTrackIds.delete(track.id));
    }
  }

  toggleTrackSelection(track: PlanTrack, checked: boolean): void {
    if (!this.canViewTrack(track)) return;
    if (checked) {
      this.selectedTrackIds.add(track.id);
    } else {
      this.selectedTrackIds.delete(track.id);
    }
  }

  downloadTrack(track: PlanTrack): void {
    if (!track.routeXml) {
      this.showMessage('No hay un GPX disponible para este track.');
      return;
    }

    const fileName = this.buildTrackFileName(track);
    const blob = new Blob([track.routeXml], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async viewTrack(track: PlanTrack, animate3d = false): Promise<void> {
    if (!track.routeXml) {
      this.showMessage('No hay un GPX disponible para este track.');
      return;
    }

    let gpxData: string;
    try {
      gpxData = track.routeXml // await firstValueFrom(this.http.get(track.routeXml, { responseType: 'text' }));
    } catch {
      this.showMessage('No se pudo descargar el GPX.');
      return;
    }

    const trkpts = this.parseTrackPointsFromGpx(gpxData);
    if (!trkpts.length) {
      this.showMessage('El GPX no contiene puntos válidos.');
      return;
    }

    const payload = {
      names: [track.name || selectedUiText('track')],
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
      viewOnly: !animate3d,
      tipoAnimacion: animate3d ? 'descubrir' : undefined,
      trackDescubrir: 0,
      camaraDescubrir: 'actual',
      velocidadDescubrir: 1,
      trackId: track.id,
      routeXml: track.routeXml
    };

    this.persistMapPayload(payload);
    this.router.navigate([animate3d ? '/discover' : '/map'], {
      queryParams: { from: 'plan', folderId: this.activeFolder?.id,
        returnTo: this.router.createUrlTree(['/plan'], { queryParams: { folderId: this.activeFolder?.id } }).toString() },
      state: { gpxViewerPayload: payload }
    });
  }

  formatTrackElevation(track: PlanTrack): string {
    const label = this.formatDesnivel(track.desnivel);
    return this.trackElevationStatuses.get(track.id) === 'partial' ? `${label} · parcial` : label;
  }

  analyzeTrack(track: PlanTrack): void {
    if (!track.routeXml) {
      this.showMessage('No hay un GPX disponible para analizar este track.');
      return;
    }

    this.router.navigate(['/analysis'], {
      queryParams: { trackId: track.id, source: 'plan', folderId: this.activeFolder?.id },
      state: {
        trackId: track.id,
        source: 'plan',
        routeTitle: track.name,
        fileName: this.buildTrackFileName(track),
        routeXml: track.routeXml
      }
    });
  }

  async viewSelectedTracks(): Promise<void> {
    const selectedTracks = this.tracks.filter(track => this.selectedTrackIds.has(track.id) && this.canViewTrack(track));
    if (!selectedTracks.length) {
      this.showMessage('Selecciona al menos un track con GPX disponible.');
      return;
    }

    const names: string[] = [];
    const trks: Array<{ trkpts: Trkpt[] }> = [];
    let skippedCount = 0;

    selectedTracks.forEach(track => {
      if (!track.routeXml) {
        skippedCount += 1;
        return;
      }
      const trkpts = this.parseTrackPointsFromGpx(track.routeXml);
      if (!trkpts.length) {
        skippedCount += 1;
        return;
      }
      names.push(track.name || selectedUiText('track'));
      trks.push({ trkpts });
    });

    if (!trks.length) {
      this.showMessage('No se pudieron cargar los tracks seleccionados.');
      return;
    }

    if (skippedCount) {
      this.showMessage('Algunos tracks seleccionados no tenían GPX válido y se omitieron.');
    }

    const payload = {
      names,
      colors: [],
      tracks: trks,
      logo: null,
      rmstops: true,
      marcarPausasLargas: false,
      umbralPausaSegundos: 60,
      activarMusica: false,
      grabarAnimacion: false,
      relacionAspectoGrabacion: '16:9',
      modoVisualizacion: 'general',
      mostrarPerfil: false,
      viewOnly: true
    };

    this.persistMapPayload(payload);
    this.router.navigate(['/map'], {
      queryParams: { from: 'plan', folderId: this.activeFolder?.id },
      state: { gpxViewerPayload: payload }
    });
  }


  private persistMapPayload(payload: unknown): void {
    this.mapPayloadTransfer.set(payload);
    try {
      sessionStorage.setItem('gpxViewerPayload', JSON.stringify(payload));
    } catch {
      this.showMessage('No se pudo guardar temporalmente la visualización en el navegador. Se abrirá igualmente en esta pestaña.');
    }
  }

  private getSelectableTracks(): PlanTrack[] {
    return this.tracks.filter(track => this.canViewTrack(track));
  }

  private clearTrackSelection(): void {
    this.selectedTrackIds.clear();
  }

  private buildTrackFileName(track: PlanTrack): string {
    const baseName = (track.name || 'track').trim();
    const normalized = baseName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const sanitized = normalized
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    const fallback = sanitized || `track-${track.id}`;
    return `${fallback}.gpx`;
  }

  private resetForecasts(): void {
    this.forecastRequests.unsubscribe();
    this.forecastRequests = new Subscription();
    this.weatherByTrackId.clear();
    this.forecastNotice = '';
    this.forecastLoading = false;
    this.forecastUpdatedAt = null;
  }

  private refreshForecasts(): void {
    this.resetForecasts();
    const plannedDate = this.editFolder?.plannedDate;
    if (!plannedDate) return;

    const tracksWithCoords = this.tracks.filter(track => track.startLat != null && track.startLon != null);
    if (!tracksWithCoords.length) return;
    let pending = tracksWithCoords.length;
    let hasAnyForecast = false;
    let hasMissingForecast = false;
    let hasError = false;
    this.forecastLoading = true;
    const finish = () => {
      pending -= 1;
      if (pending !== 0) return;
      this.forecastLoading = false;
      if (hasAnyForecast) this.forecastUpdatedAt = new Date();
      if (hasError) this.forecastNotice = hasAnyForecast
        ? selectedUiText('forecastPartialError')
        : selectedUiText('forecastError');
      else if (hasMissingForecast) this.forecastNotice = selectedUiText('forecastDateUnavailable');
    };

    tracksWithCoords.forEach(track => {
      if (track.startLat === null || track.startLon === null) return;

      this.forecastRequests.add(this.fetchForecast(track.startLat, track.startLon, plannedDate)
        .pipe(takeUntil(this.destroy$))
        .subscribe({ next: summary => {
          if (summary) {
            hasAnyForecast = true;
            this.weatherByTrackId.set(track.id, summary);
          } else {
            hasMissingForecast = true;
          }
          finish();
        }, error: () => { hasError = true; finish(); } }));
    });
  }

  private parseFolderId(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private fetchForecast(lat: number, lon: number, date: string) {
    const params = new URLSearchParams({ latitude: String(lat), longitude: String(lon),
      daily: 'weathercode,temperature_2m_max,temperature_2m_min', timezone: 'auto', forecast_days: '16' });
    return new Observable<TrackWeatherSummary | null>(subscriber => {
      const controller = new AbortController();
      // Fetch's cache mode bypasses the browser cache without custom CORS headers.
      fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { cache: 'no-store', signal: controller.signal })
        .then(response => { if (!response.ok) throw new Error('Forecast unavailable'); return response.json(); })
        .then(response => { subscriber.next(this.pickForecastForDate(response, date)); subscriber.complete(); })
        .catch(error => { if (!controller.signal.aborted) subscriber.error(error); });
      return () => controller.abort();
    });
  }

  private pickForecastForDate(response: ForecastResponse, date: string): TrackWeatherSummary | null {
    const index = response.daily.time.findIndex(item => item === date);
    if (index === -1) return null;
    return {
      date: response.daily.time[index],
      weatherCode: response.daily.weathercode[index],
      maxTemp: Math.round(response.daily.temperature_2m_max[index]),
      minTemp: Math.round(response.daily.temperature_2m_min[index])
    };
  }

  private mapWeatherCode(code: number): string {
    const map: Record<number, string> = {
      0: 'Despejado',
      1: 'Mayormente despejado',
      2: 'Parcialmente nublado',
      3: 'Nublado',
      45: 'Niebla',
      48: 'Niebla helada',
      51: 'Llovizna ligera',
      53: 'Llovizna',
      55: 'Llovizna intensa',
      61: 'Lluvia ligera',
      63: 'Lluvia',
      65: 'Lluvia intensa',
      71: 'Nieve ligera',
      73: 'Nieve',
      75: 'Nieve intensa',
      80: 'Chubascos',
      81: 'Chubascos moderados',
      82: 'Chubascos fuertes',
      95: 'Tormenta',
      96: 'Tormenta con granizo',
      99: 'Tormenta intensa'
    };
    return map[code] ?? selectedUiText('weather');
  }

  private mapWeatherIcon(code: number): string {
    if (code === 0) return '☀️';
    if (code === 1) return '🌤️';
    if (code === 2) return '⛅️';
    if (code === 3) return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if (code >= 71 && code <= 75) return '🌨️';
    if ((code >= 51 && code <= 55) || (code >= 61 && code <= 65)) return '🌧️';
    if (code >= 80 && code <= 82) return '🌦️';
    if (code >= 95) return '⛈️';
    return '☁️';
  }

  private mapWeatherCategory(code: number): string {
    if (code === 0 || code === 1) return 'Sol';
    if ([2, 3, 45, 48].includes(code)) return 'Nublado';
    if ((code >= 51 && code <= 65) || (code >= 80 && code <= 82) || (code >= 71 && code <= 75)) return 'Chubascos';
    if (code >= 95) return 'Tormenta';
    return 'Nublado';
  }

  private applyVotes(response: PlanFolderVotesResponse): void {
    this.votesByTrackId.clear();
    response.votes.forEach(vote => this.votesByTrackId.set(vote.trackId, vote.votes));
    this.userVoteTrackId = response.userVoteTrackId;
  }

  private applyTrackVotesSummary(summaries: PlanTrackVotesSummary[]): void {
    this.votesByTrackId.clear();
    this.userVoteTrackId = null;
    summaries.forEach(summary => {
      this.votesByTrackId.set(summary.trackId, Number(summary.totalVotes ?? 0));
      if (summary.votedByUser) {
        this.userVoteTrackId = summary.trackId;
      }
    });
  }

  private refreshTrackVotesSummary(): Observable<PlanTrackVotesSummary[]> {
    if (!this.tracks.length) {
      return of([]);
    }
    return forkJoin(this.tracks.map(track => this.planService.getTrackVotesSummary(track.id)));
  }

  private loadInvitations(folderId: number): void {
    if (!folderId) return;
    this.planService.getInvitations(folderId).subscribe(invitations => {
      this.folderInvitations = invitations;
      this.sentInviteUserIds.clear();
      this.updateFolderSharedState(folderId, invitations.length > 0);
    });
  }

  private updateFolderSharedState(folderId: number, shared: boolean): void {
    this.folders = this.folders.map(folder => (folder.id === folderId ? { ...folder, shared } : folder));
    if (this.activeFolder?.id === folderId) {
      this.activeFolder = { ...this.activeFolder, shared };
    }
  }

  private resolveInvitation(user: PlanUserSearchResult): PlanInvitation | undefined {
    const normalizedUserId = Number(user.id);
    const normalizedUserEmail = (user.email ?? '').trim().toLowerCase();

    return this.folderInvitations.find(invite => {
      const invitedUserId = Number(invite.invitedUserId);
      const userId = Number(invite.userId);
      const invitedEmail = (invite.invitedEmail ?? '').trim().toLowerCase();
      const email = (invite.email ?? '').trim().toLowerCase();

      return (Number.isFinite(invitedUserId) && invitedUserId === normalizedUserId)
        || (Number.isFinite(userId) && userId === normalizedUserId)
        || (normalizedUserEmail && invitedEmail === normalizedUserEmail)
        || (normalizedUserEmail && email === normalizedUserEmail);
    });
  }

  resolveInvitationLabel(invitation: PlanInvitation): string {
    const nickname = invitation.nickname?.trim();
    if (nickname) return nickname;
    const name = invitation.name?.trim();
    if (name) return name;
    const email = invitation.email?.trim() ?? invitation.invitedEmail?.trim();
    if (email) return this.obfuscateEmail(email);
    const userId = invitation.invitedUserId ?? invitation.userId;
    if (userId) return `Usuario #${userId}`;
    return 'Usuario sin identificar';
  }

  resolveInvitationSecondary(invitation: PlanInvitation): string | null {
    const primary = this.resolveInvitationLabel(invitation);
    const email = invitation.email?.trim() ?? invitation.invitedEmail?.trim();
    if (!email) return null;
    const obfuscated = this.obfuscateEmail(email);
    if (obfuscated === primary) return null;
    return obfuscated;
  }

  resolveInvitationStatusLabel(invitation: PlanInvitation): string {
    const statusMap: Record<string, string> = {
      accepted: selectedUiText('invitationAccepted'),
      pending: selectedUiText('invitationPending'),
      sending: selectedUiText('invitationSending'),
      declined: selectedUiText('invitationRejected'),
      rejected: selectedUiText('invitationRejected'),
      rejeted: selectedUiText('invitationRejected'),
      revoked: selectedUiText('invitationRevoked'),
      expired: selectedUiText('invitationExpired')
    };
    return statusMap[invitation.status] ?? selectedUiText('invitationPending');
  }

  private isRejectedStatus(status: string | null | undefined): boolean {
    const normalizedStatus = (status ?? '').toLowerCase();
    return normalizedStatus === 'declined' || normalizedStatus === 'rejected' || normalizedStatus === 'rejeted';
  }

  resolveInvitationStatusDate(invitation: PlanInvitation): string | null {
    const rawDate = invitation.respondedAt || invitation.createdAt || invitation.expiresAt;
    return this.formatInvitationDate(rawDate);
  }

  resolveInvitationModifiedDate(invitation: PlanInvitation): string | null {
    const rawDate = invitation.modifiedAt ?? (invitation as { modified_at?: string | null }).modified_at ?? null;
    return this.formatInvitationDate(rawDate);
  }

  resendInvitation(invitation: PlanInvitation): void {
    const userId = invitation.invitedUserId ?? invitation.userId;
    if (!userId) {
      this.showMessage('No se pudo reenviar la invitación porque falta el usuario.');
      return;
    }
    const previousStatus = invitation.status;
    invitation.status = 'sending';
    this.planService
      .updateMemberStatus({ id: invitation.id, status: 'sending' })
      .subscribe({
        next: () => {
          this.inviteStatusMessage = `Invitación enviada a ${this.resolveInvitationLabel(invitation)}.`;
          this.createInvitationMessage(invitation);
        },
        error: () => {
          invitation.status = previousStatus;
          this.showMessage('No se pudo enviar la invitación.');
        }
      });
  }

  canResendInvitation(invitation: PlanInvitation): boolean {
    const userId = invitation.invitedUserId ?? invitation.userId;
    return invitation.status === 'revoked' && !!userId;
  }

  resolveResendInvitationLabel(invitation: PlanInvitation): string {
    return invitation.status === 'revoked' ? selectedUiText('sendInvitation') : selectedUiText('invitationSent');
  }

  private toDateValue(value: string | null): string | null {
    if (!value) return null;
    const [datePart] = value.split('T');
    const [year, month, day] = datePart.split('-');
    if (!year || !month || !day) return null;
    return `${year}-${month}-${day}`;
  }

  private formatDateForApi(date: Date | string | null): string | null {
    if (!date) return null;
    if (typeof date === 'string') {
      return date.split('T')[0] ?? null;
    }
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private createInvitationMessage(invitation: PlanInvitation): void {
    const recipientId = invitation.invitedUserId ?? invitation.userId;
    if (!recipientId) return;
    const folderName = this.activeFolder?.name?.trim();
    if (!folderName) return;

    const session = this.getAuthSession();
    const senderName = session?.nickname?.trim() || session?.name?.trim() || 'Un usuario';
    const senderId = session?.id ?? this.userId;
    const mensaje = `${senderName}, te invita a compartir la carpeta de la proxima salida "${folderName}". ¿Aceptas?`;

    const payload: InvitationMessagePayload = {
      userId: recipientId,
      userMsgId: senderId,
      mensaje,
      tipoMsg: 1,
      idInvitacion: invitation.id
    };

    this.http.post(`${environment.mensajesApiBase}`, payload).subscribe({
      error: () => {
        this.showMessage('No se pudo registrar el mensaje de invitación.');
      }
    });
  }

  private getAuthSession(): LoginSuccessResponse | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const stored = localStorage.getItem('gpxAuthSession');
      if (!stored) return null;
      return JSON.parse(stored) as LoginSuccessResponse;
    } catch {
      return null;
    }
  }


  private buildGpxFromTrackPoints(points: Array<{ lat: number; lon: number; ele?: number }>, name: string): string {
    const escapedName = this.escapeXml(name || 'Ruta circular');
    const trkpts = points
      .map(point => {
        const eleTag = Number.isFinite(point.ele) ? `<ele>${Number(point.ele).toFixed(1)}</ele>` : '';
        return `<trkpt lat="${point.lat.toFixed(6)}" lon="${point.lon.toFixed(6)}">${eleTag}</trkpt>`;
      })
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
`
      + `<gpx version="1.1" creator="GPX Maps" xmlns="http://www.topografix.com/GPX/1/1">
`
      + `  <trk>
`
      + `    <name>${escapedName}</name>
`
      + `    <trkseg>${trkpts}</trkseg>
`
      + `  </trk>
`
      + `</gpx>`;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private mergeTrackWithPayload(track: PlanTrack, payload: PlanTrackImportPayload): PlanTrack {
    return this.ensureTrackDifficulty({
      ...track,
      name: track.name || payload.name,
      startLat: track.startLat ?? payload.start_lat,
      startLon: track.startLon ?? payload.start_lon,
      startPopulation: track.startPopulation ?? payload.start_population,
      distanceKm: track.distanceKm ?? payload.distance_km,
      movingTimeSec: track.movingTimeSec ?? payload.moving_time_sec,
      totalTimeSec: track.totalTimeSec ?? payload.total_time_sec,
      desnivel: payload.desnivel,
      difficultyScore: track.difficultyScore ?? payload.difficulty_score,
      difficultyLevel: track.difficultyLevel ?? payload.difficulty_level,
      difficultyVersion: track.difficultyVersion ?? payload.difficulty_version ?? 1,
      routeXml: track.routeXml ?? payload.route_xml
    });
  }

  private updateActiveFolderTrackCount(delta: number): void {
    if (!this.activeFolder) return;
    const currentCount = this.resolveFolderTrackCount(this.activeFolder);
    const updatedCount = Math.max(0, currentCount + delta);
    this.updateFolderTrackCountCache(this.activeFolder.id, updatedCount);
  }

  private updateFolderTrackCountCache(folderId: number, count: number): void {
    this.folderTrackCounts.set(folderId, count);
    this.folders = this.folders.map(folder =>
      folder.id === folderId ? { ...folder, tracksCount: count } : folder
    );
    if (this.activeFolder?.id === folderId) {
      this.activeFolder = { ...this.activeFolder, tracksCount: count };
    }
  }

  onPlannedDateChange(date: string | null): void {
    if (!this.editFolder) return;
    this.editFolder.plannedDate = date;
    this.refreshForecasts();
  }

  private async buildTrackImportPayload(folderId: number, file: File) {
    const gpxData = await this.gpxImportService.readFileAsText(file);
    const trkpts = this.gpxImportService.parseTrackPointsFromString(gpxData);
    if (!trkpts.length) {
      this.showMessage('El archivo no es un GPX válido.');
      return null;
    }

    const location = await this.gpxImportService.resolveTrackLocationFromGpx(gpxData);
    const startLat = location.startLatitude ?? trkpts[0].lat;
    const startLon = location.startLongitude ?? trkpts[0].lon;
    const elevation = calculateGpxElevation(gpxData);
    const distanceKm = elevation.distanceKm;
    const movingTimeSec = this.gpxImportService.calculateActiveDurationSeconds(trkpts);
    const totalTimeSec = this.gpxImportService.calculateTotalDurationSeconds(trkpts);
    const desnivel = elevation.gain;
    const difficulty = this.calculateTrackDifficultyMetrics(distanceKm, desnivel, movingTimeSec);

    return {
      folder_id: folderId,
      created_by_user_id: this.userId,
      name: file.name,
      start_lat: Number.isFinite(startLat) ? startLat : null,
      start_lon: Number.isFinite(startLon) ? startLon : null,
      start_population: location.population,
      distance_km: Number.isFinite(distanceKm) ? distanceKm : null,
      moving_time_sec: Number.isFinite(movingTimeSec) ? movingTimeSec : null,
      total_time_sec: Number.isFinite(totalTimeSec) ? totalTimeSec : null,
      desnivel,
      difficulty_score: difficulty.score,
      difficulty_level: difficulty.level,
      difficulty_version: 1,
      route_xml: gpxData
    };
  }


  private ensureTrackDifficulty(track: PlanTrack): PlanTrack {
    if (track.routeXml?.trim().startsWith('<')) {
      try {
        const elevation = calculateGpxElevation(track.routeXml);
        this.trackElevationStatuses.set(track.id, elevation.status);
        const difficulty = this.calculateTrackDifficultyMetrics(elevation.distanceKm, elevation.gain, track.movingTimeSec ?? null);
        return { ...track, distanceKm: elevation.distanceKm, desnivel: elevation.gain, elevationQuality: elevation.quality,
          difficultyScore: difficulty.score, difficultyLevel: difficulty.level, difficultyVersion: 1 };
      } catch {
        this.trackElevationStatuses.delete(track.id);
      }
    }
    if (Number.isFinite(Number(track.difficultyLevel)) && Number(track.difficultyLevel) > 0) {
      return track;
    }

    const difficulty = this.calculateTrackDifficultyMetrics(
      track.distanceKm ?? null,
      track.desnivel ?? null,
      track.movingTimeSec ?? null
    );

    if (!Number.isFinite(Number(difficulty.level)) || Number(difficulty.level) <= 0) {
      return track;
    }

    return {
      ...track,
      difficultyScore: difficulty.score,
      difficultyLevel: difficulty.level,
      difficultyVersion: track.difficultyVersion ?? 1
    };
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

  private parseTrackPointsFromGpx(gpxData: string): { lat: number; lon: number; ele?: number; time: string }[] {
    return this.gpxImportService.parseTrackPointsFromString(gpxData);
  }
  private normalizeEditableField(value: string | null | undefined): string {
    return (value ?? '').trim();
  }

  private openInfoDialog(data: InfoDialogData): Promise<InfoDialogResult | undefined> {
    const dialogRef = this.dialog.open<InfoDialogComponent, InfoDialogData, InfoDialogResult>(InfoDialogComponent, {
      width: '420px',
      panelClass: 'tracketeo-message-dialog',
      data
    });

    return firstValueFrom(dialogRef.afterClosed());
  }

  private showMessage(message: string, title = selectedUiText('noticeTitle')): void {
    this.infoMessageService.showMessage({
      title,
      message
    });
  }

  private formatInvitationDate(rawDate?: string | null): string | null {
    if (!rawDate) return null;
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(document.documentElement.lang, {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private obfuscateEmail(email: string): string {
    const trimmed = email.trim();
    const [local, domain] = trimmed.split('@');
    if (!domain) return trimmed;
    const safeLocal = this.maskSegment(local);
    const [domainName, ...domainParts] = domain.split('.');
    const safeDomainName = this.maskSegment(domainName);
    const safeDomain = [safeDomainName, ...domainParts].filter(Boolean).join('.');
    return `${safeLocal}@${safeDomain}`;
  }

  private maskSegment(segment: string): string {
    if (!segment) return segment;
    if (segment.length <= 2) {
      return `${segment[0]}***`;
    }
    const first = segment[0];
    const last = segment[segment.length - 1];
    return `${first}***${last}`;
  }
}
