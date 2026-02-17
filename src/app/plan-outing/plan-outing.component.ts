import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, debounceTime, firstValueFrom, forkJoin, map, of, switchMap, takeUntil } from 'rxjs';
import { InfoDialogComponent, InfoDialogData, InfoDialogResult } from '../info-dialog/info-dialog.component';
import { PlanService, PlanTrackImportPayload } from '../services/plan.service';
import { GpxImportService } from '../services/gpx-import.service';
import { InfoMessageService } from '../services/info-message.service';
import { MapPayloadTransferService } from '../services/map-payload-transfer.service';
import { UserIdentityService } from '../services/user-identity.service';
import { PlanFolder,  PlanFolderVotesResponse, PlanInvitation, PlanTrack, PlanTrackVotesSummary, PlanUserSearchResult, TrackWeatherSummary } from '../interfaces/plan';
import { LoginSuccessResponse } from '../interfaces/auth';
import { environment } from 'src/environments/environment';

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

@Component({
  selector: 'app-plan-outing',
  templateUrl: './plan-outing.component.html',
  styleUrls: ['./plan-outing.component.css']
})
export class PlanOutingComponent implements OnInit, OnDestroy {
  @ViewChild('trackInput') trackInput?: ElementRef<HTMLInputElement>;

  folders: PlanFolder[] = [];
  filteredFolders: PlanFolder[] = [];
  activeFolder: PlanFolder | null = null;
  editFolder: EditableFolder | null = null;
  tracks: PlanTrack[] = [];
  selectedTrackIds = new Set<number>();
  votesByTrackId = new Map<number, number>();
  userVoteTrackId: number | null = null;
  weatherByTrackId = new Map<number, TrackWeatherSummary>();
  folderTrackCounts = new Map<number, number>();
  forecastNotice = '';

  readonly difficultyLegend: TrackDifficulty[] = [
    { key: 'easy', label: 'Suave', description: 'Ruta con exigencia baja.' },
    { key: 'medium', label: 'Media', description: 'Ruta con exigencia moderada.' },
    { key: 'hard', label: 'Dura', description: 'Ruta exigente en forma física.' },
    { key: 'very-hard', label: 'Muy dura', description: 'Ruta muy exigente; requiere muy buena forma física.' },
    { key: 'unknown', label: 'Sin datos', description: 'No hay métricas suficientes para estimar dureza.' }
  ];

  folderSearch = '';
  showNewFolderForm = false;
  newFolderName = '';
  newFolderDate: Date | null = null;
  newFolderNotes = '';

  inviteQuery = '';
  inviteStatusMessage = '';
  folderInvitations: PlanInvitation[] = [];

  isLoadingFolders = false;
  isSavingFolder = false;
  isLoadingTracks = false;
  isImportingTrack = false;
  isLoadingPendingMessages = false;
  showPendingMessages = false;
  pendingMessages: PendingMessage[] = [];

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
        this.inviteStatusMessage = response.notFound
          ? 'No se encuentra ningún usuario con ese nick o email.'
          : (response.users.length ? '' : (this.inviteQuery ? 'No se encontraron usuarios.' : ''));
        if (response.users.length) {
          this.addFolderMembersFromSearch(response.users);
        }
      });
  }

  ngOnDestroy(): void {
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
    this.isLoadingPendingMessages = true;
    const userId = JSON.parse(localStorage.getItem('gpxAuthSession') ?? 'null')?.id;
    this.http
      .get<PendingMessage[]>(`${environment.mensajesApiBase}/usuario/${userId}/pendientes`)
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


  toggleNewFolderForm(): void {
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

  selectFolder(folder: PlanFolder): void {
    this.activeFolder = folder;
    this.editFolder = {
      name: folder.name,
      plannedDate: this.toDateValue(folder.plannedDate),
      observations: folder.observations
    };
    this.loadTracks(folder.id);
    this.loadInvitations(folder.id);
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
        this.isSavingFolder = false;
        this.refreshForecasts();
      });
  }

  async confirmDeleteFolder(folder: PlanFolder): Promise<void> {
    const decision = await this.openInfoDialog({
      title: 'Eliminar carpeta',
      message: `¿Seguro que quieres eliminar “${folder.name}”? Se eliminará toda la información de la carpeta, incluidos sus tracks.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar'
    });

    if (decision !== 'confirm') return;
    this.planService.deleteFolder(folder.id).subscribe(() => {
      this.folders = this.folders.filter(current => current.id !== folder.id);
      this.folderTrackCounts.delete(folder.id);
      this.applyFolderFilter();
      if (this.activeFolder?.id === folder.id) {
        this.activeFolder = null;
        this.editFolder = null;
        this.tracks = [];
        this.clearTrackSelection();
        this.votesByTrackId.clear();
        this.userVoteTrackId = null;
      }
      if (this.folders.length) {
        this.selectFolder(this.folders[0]);
      }
    });
  }

  async confirmDeleteTrack(track: PlanTrack): Promise<void> {
    if (!this.activeFolder) return;
    if (!this.canDeleteTracks()) {
      this.showMessage('Solo el propietario de la carpeta puede eliminar tracks compartidos.');
      return;
    }
    const decision = await this.openInfoDialog({
      title: 'Eliminar track',
      message: `¿Seguro que quieres eliminar “${track.name}” de esta carpeta?`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar'
    });

    if (decision !== 'confirm') return;
    this.planService.deleteTrack(track.id).subscribe(() => {
      this.tracks = this.tracks.filter(current => current.id !== track.id);
      this.selectedTrackIds.delete(track.id);
      this.votesByTrackId.delete(track.id);
      if (this.userVoteTrackId === track.id) {
        this.userVoteTrackId = null;
      }
      this.updateActiveFolderTrackCount(-1);
      this.refreshForecasts();
    });
  }

  loadTracks(folderId: number): void {
    this.isLoadingTracks = true;
    this.planService.getTracks(folderId).pipe(
      switchMap(tracks => {
        this.tracks = tracks;
        this.clearTrackSelection();
        this.updateFolderTrackCountCache(folderId, tracks.length);
        this.refreshForecasts();
        if (!tracks.length) {
          this.votesByTrackId.clear();
          this.userVoteTrackId = null;
          return of([]);
        }
        return forkJoin(tracks.map(track => this.planService.getTrackVotesSummary(track.id)));
      })
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

  onTrackImportClick(): void {
    this.trackInput?.nativeElement?.click();
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
    this.inviteSearch$.next(this.inviteQuery);
  }

  inviteUser(user: PlanUserSearchResult): void {
    if (!this.activeFolder) return;

    const now = new Date().toISOString();
    this.planService
      .inviteUser(this.activeFolder.id, {
        folder_id: this.activeFolder.id,
        user_id: user.id,
        status: 'pending',
        invited_email: user.email,
        created_at: now,
        modified_at: now,
        invited_by: this.userId
      })
      .subscribe(() => {
        this.inviteStatusMessage = `Invitación enviada a ${this.resolveInviteNickname(user)}.`;
        this.loadInvitations(this.activeFolder?.id ?? 0);
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
      cancelLabel: 'Cancelar'
    });
    if (confirmResult !== 'confirm') return;

    this.planService.removeFolderMember(this.activeFolder.id, userId).subscribe(() => {
      this.inviteStatusMessage = `Se quitó el acceso de ${this.resolveInvitationLabel(invitation)}.`;
      this.loadInvitations(this.activeFolder?.id ?? 0);
    });
  }

  private addFolderMembersFromSearch(users: PlanUserSearchResult[]): void {
    if (!this.activeFolder) return;
    const nickname = this.inviteQuery.trim();
    if (!nickname) return;
    const folderId = this.activeFolder.id;
    const addRequests = users.map(user =>
      this.planService
        .addFolderMember(folderId, {
          folderId,
          userId: user.id,
          nickname,
          email: user.email
        })
        .pipe(map(() => user))
    );
    if (!addRequests.length) return;

    forkJoin(addRequests).subscribe(addedUsers => {
      const label = addedUsers.length === 1
        ? this.resolveInviteNickname(addedUsers[0])
        : `${addedUsers.length} usuarios`;
      this.inviteStatusMessage = `Se añadió acceso a ${label}.`;
      this.applyOptimisticInvitations(folderId, addedUsers);
      this.refreshInvitationsAfterSearchAdd(folderId, addedUsers.map(user => user.id));
    });
  }

  private applyOptimisticInvitations(folderId: number, users: PlanUserSearchResult[]): void {
    if (!users.length) return;

    const now = new Date().toISOString();
    const existingUserIds = new Set(
      this.folderInvitations
        .map(invitation => invitation.invitedUserId ?? invitation.userId)
        .filter((id): id is number => typeof id === 'number')
    );

    const optimisticInvitations = users
      .filter(user => !existingUserIds.has(user.id))
      .map((user, index) => ({
        id: -(Date.now() + index),
        folderId,
        userId: user.id,
        invitedUserId: user.id,
        invitedByUserId: this.userId,
        role: 'viewer' as const,
        status: 'sending' as const,
        token: `optimistic-${user.id}-${Date.now()}-${index}`,
        createdAt: now,
        modifiedAt: now,
        nickname: user.name?.trim() || null,
        name: user.name?.trim() || null,
        email: user.email,
        invitedEmail: user.email
      }));

    if (!optimisticInvitations.length) return;

    this.folderInvitations = [...this.folderInvitations, ...optimisticInvitations];
    this.updateFolderSharedState(folderId, true);
  }

  private refreshInvitationsAfterSearchAdd(folderId: number, expectedUserIds: number[], retries = 12): void {
    this.planService.getInvitations(folderId).subscribe(invitations => {
      this.folderInvitations = invitations;
      this.updateFolderSharedState(folderId, invitations.length > 0);

      const loadedIds = new Set(
        invitations
          .map(invitation => invitation.invitedUserId ?? invitation.userId)
          .filter((id): id is number => typeof id === 'number')
      );
      const missingUsers = expectedUserIds.some(userId => !loadedIds.has(userId));

      if (missingUsers && retries > 0) {
        setTimeout(() => this.refreshInvitationsAfterSearchAdd(folderId, expectedUserIds, retries - 1), 400);
      }
    });
  }

  resolveInviteNickname(user: PlanUserSearchResult): string {
    const nickname = user.name?.trim();
    return nickname ? nickname : 'Sin nick';
  }

  resolveInviteStatus(user: PlanUserSearchResult): string {
    const invitation = this.resolveInvitation(user);
    if (!invitation) return 'Sin enviar';
    const statusMap: Record<PlanInvitation['status'], string> = {
      accepted: 'Aceptó',
      pending: 'Pendiente',
      sending: 'Enviando',
      declined: 'Rechazó',
      revoked: 'Revocada',
      expired: 'Caducada'
    };
    return statusMap[invitation.status] ?? 'Pendiente';
  }

  canSendInvite(user: PlanUserSearchResult): boolean {
    const invitation = this.resolveInvitation(user);
    return !invitation || ['pending', 'declined', 'revoked', 'expired'].includes(invitation.status);
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
    return this.userVoteTrackId === track.id ? 'Quitar voto' : 'Votar';
  }

  resolveWeatherLabel(trackId: number): string {
    const summary = this.weatherByTrackId.get(trackId);
    if (!summary) return '—';
    return `${this.mapWeatherCode(summary.weatherCode)} · ${summary.minTemp}°/${summary.maxTemp}°`;
  }

  resolveWeatherHint(trackId: number): string {
    const summary = this.weatherByTrackId.get(trackId);
    if (!summary) return 'Fecha demasiado lejana para la predicción';
    return `Predicción ${summary.date}`;
  }

  resolveWeatherIcon(trackId: number): string {
    const summary = this.weatherByTrackId.get(trackId);
    if (!summary) return '—';
    return this.mapWeatherIcon(summary.weatherCode);
  }

  resolveWeatherCategory(trackId: number): string {
    const summary = this.weatherByTrackId.get(trackId);
    if (!summary) return 'Sin datos';
    return this.mapWeatherCategory(summary.weatherCode);
  }

  resolveWeatherTemperature(trackId: number): string {
    const summary = this.weatherByTrackId.get(trackId);
    if (!summary) return 'Fecha demasiado lejana';
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
      return folder.shared ? 'Compartida' : 'Privada';
    }

    return folder.ownerId !== this.userId ? 'Compartida' : 'Privada';
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
      return '-';
    }
    return `${Math.round(desnivel)} m`;
  }


  getTrackDifficulty(track: PlanTrack): TrackDifficulty {
    const distanceKm = Number(track.distanceKm);
    const desnivel = Number(track.desnivel);

    if (!Number.isFinite(distanceKm) || distanceKm <= 0 || !Number.isFinite(desnivel) || desnivel < 0) {
      return this.difficultyLegend.find(item => item.key === 'unknown')!;
    }

    const movingTimeHours = Number.isFinite(Number(track.movingTimeSec)) && Number(track.movingTimeSec) > 0
      ? Number(track.movingTimeSec) / 3600
      : null;

    const ascentPerKm = desnivel / Math.max(distanceKm, 0.1);
    const climbRate = movingTimeHours ? desnivel / movingTimeHours : 0;

    let score = 0;
    score += Math.min(distanceKm / 35, 1) * 30;
    score += Math.min(desnivel / 1800, 1) * 35;
    score += Math.min(ascentPerKm / 140, 1) * 25;
    score += Math.min(climbRate / 900, 1) * 10;

    if (score >= 75) return this.difficultyLegend.find(item => item.key === 'very-hard')!;
    if (score >= 55) return this.difficultyLegend.find(item => item.key === 'hard')!;
    if (score >= 35) return this.difficultyLegend.find(item => item.key === 'medium')!;
    return this.difficultyLegend.find(item => item.key === 'easy')!;
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

  async viewTrack(track: PlanTrack): Promise<void> {
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
      names: [track.name || 'Track'],
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
      trackId: track.id,
      routeXml: track.routeXml
    };

    this.persistMapPayload(payload);
    this.router.navigate(['/map'], {
      queryParams: { from: 'plan', folderId: this.activeFolder?.id },
      state: { gpxViewerPayload: payload }
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
      names.push(track.name || 'Track');
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

  private refreshForecasts(): void {
    this.weatherByTrackId.clear();
    this.forecastNotice = '';
    const plannedDate = this.editFolder?.plannedDate;
    if (!plannedDate) return;

    const tracksWithCoords = this.tracks.filter(track => track.startLat !== null && track.startLon !== null);
    if (!tracksWithCoords.length) return;
    let pending = tracksWithCoords.length;
    let hasAnyForecast = false;
    let hasMissingForecast = false;

    tracksWithCoords.forEach(track => {
      if (track.startLat === null || track.startLon === null) return;

      this.fetchForecast(track.startLat, track.startLon, plannedDate)
        .pipe(takeUntil(this.destroy$))
        .subscribe(summary => {
          if (summary) {
            hasAnyForecast = true;
            this.weatherByTrackId.set(track.id, summary);
          } else {
            hasMissingForecast = true;
          }
          pending -= 1;
          if (pending === 0 && !hasAnyForecast && hasMissingForecast) {
            this.forecastNotice = 'La predicción no está disponible para la fecha seleccionada (demasiado futura).';
          }
        });
    });
  }

  private parseFolderId(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private fetchForecast(lat: number, lon: number, date: string) {
    const url = 'https://api.open-meteo.com/v1/forecast';
    return this.http
      .get<ForecastResponse>(url, {
        params: {
          latitude: lat,
          longitude: lon,
          daily: 'weathercode,temperature_2m_max,temperature_2m_min',
          timezone: 'Europe/Madrid'
        }
      })
      .pipe(
        map(response => this.pickForecastForDate(response, date))
      );
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
    return map[code] ?? 'Meteo';
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
    return this.folderInvitations.find(invite =>
      (invite.invitedUserId && invite.invitedUserId === user.id)
      || (invite.userId && invite.userId === user.id)
      || invite.invitedEmail === user.email
      || invite.email === user.email
    );
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
    const statusMap: Record<PlanInvitation['status'], string> = {
      accepted: 'Aceptó',
      pending: 'Pendiente',
      sending: 'Enviando',
      declined: 'Rechazó',
      revoked: 'Revocada',
      expired: 'Caducada'
    };
    return statusMap[invitation.status] ?? 'Pendiente';
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
    return invitation.status === 'revoked' ? 'Enviar invitación' : 'Enviada';
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

  private mergeTrackWithPayload(track: PlanTrack, payload: PlanTrackImportPayload): PlanTrack {
    return {
      ...track,
      name: track.name || payload.name,
      startLat: track.startLat ?? payload.start_lat,
      startLon: track.startLon ?? payload.start_lon,
      startPopulation: track.startPopulation ?? payload.start_population,
      distanceKm: track.distanceKm ?? payload.distance_km,
      movingTimeSec: track.movingTimeSec ?? payload.moving_time_sec,
      totalTimeSec: track.totalTimeSec ?? payload.total_time_sec,
      desnivel: track.desnivel ?? payload.desnivel,
      routeXml: track.routeXml ?? payload.route_xml
    };
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
    const distanceKm = this.gpxImportService.calculateTotalDistanceKm(trkpts);
    const movingTimeSec = this.gpxImportService.calculateActiveDurationSeconds(trkpts);
    const totalTimeSec = this.gpxImportService.calculateTotalDurationSeconds(trkpts);
    const reportedAscent = this.gpxImportService.extractReportedAscentMeters(gpxData);
    const computedAscent = this.calculateTotalAscent(trkpts, {
      stepMeters: 20,
      smoothWindowMeters: 40,
      minStepUpMeters: 0.25
    });
    const desnivel = reportedAscent ?? computedAscent;

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
      desnivel: Number.isFinite(desnivel) ? Math.trunc(desnivel) : null,
      route_xml: gpxData
    };
  }

  //calcular desnivel
private toFiniteOrNull(v: unknown): number | null {
  return Number.isFinite(v) ? (v as number) : null;
}

private haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Remuestrea a paso fijo (m). Interpola elevación linealmente. */
private resampleByDistance(trkpts: Trkpt[], stepMeters: number): { dist: number[]; ele: number[] } {
  const n = trkpts.length;
  if (n === 0) return { dist: [], ele: [] };
  if (n === 1) return { dist: [0], ele: [this.toFiniteOrNull(trkpts[0].ele) ?? 0] };

  // Elevaciones sin nulls (rellena con último válido)
  const eleRaw: number[] = new Array(n);
  let last = this.toFiniteOrNull(trkpts[0].ele) ?? 0;
  for (let i = 0; i < n; i++) {
    const e = this.toFiniteOrNull(trkpts[i].ele);
    if (e !== null) last = e;
    eleRaw[i] = last;
  }

  // Distancia acumulada
  const cum: number[] = new Array(n);
  cum[0] = 0;
  for (let i = 0; i < n - 1; i++) {
    cum[i + 1] = cum[i] + this.haversineMeters(trkpts[i], trkpts[i + 1]);
  }

  const total = cum[n - 1];
  if (total <= 0) return { dist: [0], ele: [eleRaw[0]] };

  const outDist: number[] = [];
  const outEle: number[] = [];

  let seg = 0;
  for (let target = 0; target <= total; target += stepMeters) {
    while (seg < n - 2 && cum[seg + 1] < target) seg++;

    const d0 = cum[seg];
    const d1 = cum[seg + 1];
    const len = Math.max(1e-9, d1 - d0);
    const t = (target - d0) / len;

    const e0 = eleRaw[seg];
    const e1 = eleRaw[seg + 1];
    outDist.push(target);
    outEle.push(e0 + (e1 - e0) * t);
  }

  // Asegura el último punto exacto
  if (outDist[outDist.length - 1] < total) {
    outDist.push(total);
    outEle.push(eleRaw[n - 1]);
  }

  return { dist: outDist, ele: outEle };
}

/** Media móvil centrada (windowPoints impar) usando prefijos. */
private movingAverageCentered(values: number[], windowPoints: number): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (windowPoints < 3) return values.slice();
  if (windowPoints % 2 === 0) windowPoints += 1;

  const half = Math.floor(windowPoints / 2);

  // Padding por bordes (replica)
  const padded: number[] = new Array(n + 2 * half);
  for (let i = 0; i < half; i++) padded[i] = values[0];
  for (let i = 0; i < n; i++) padded[half + i] = values[i];
  for (let i = 0; i < half; i++) padded[half + n + i] = values[n - 1];

  // Prefijos
  const pref: number[] = new Array(padded.length + 1);
  pref[0] = 0;
  for (let i = 0; i < padded.length; i++) pref[i + 1] = pref[i] + padded[i];

  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const start = i;
    const end = i + windowPoints;
    out[i] = (pref[end] - pref[start]) / windowPoints;
  }
  return out;
}

/**
 * Versión robusta del desnivel acumulado.
 * Por defecto, con muchos GPX ruidosos deja valores muy cercanos a lo esperado.
 */
private calculateTotalAscent(
  trkpts: Trkpt[],
  opts?: {
    stepMeters?: number;         // remuestreo (m)
    smoothWindowMeters?: number; // suavizado (m)
    minStepUpMeters?: number;    // umbral por paso (m)
    maxJumpMeters?: number;      // cap anti-picos (m)
  }
): number {
  if (!trkpts?.length) return 0;

  const stepMeters = opts?.stepMeters ?? 20;
  const smoothWindowMeters = opts?.smoothWindowMeters ?? 200;
  const minStepUpMeters = opts?.minStepUpMeters ?? 0.5;
  const maxJumpMeters = opts?.maxJumpMeters ?? 50; // por seguridad ante picos absurdos

  const { dist, ele } = this.resampleByDistance(trkpts, stepMeters);

  const windowPoints = Math.max(3, Math.round(smoothWindowMeters / stepMeters));
  const smooth = this.movingAverageCentered(ele, windowPoints);

  let total = 0;
  let prev = smooth[0];

  for (let i = 1; i < smooth.length; i++) {
    let diff = smooth[i] - prev;

    // Anti-picos (por si hay valores raros puntuales)
    if (diff > maxJumpMeters) diff = 0;
    if (diff < -maxJumpMeters) diff = 0;

    if (diff > minStepUpMeters) total += diff;
    prev = smooth[i];
  }

  return total;
}

  //**********************************************************************

  private parseTrackPointsFromGpx(
    gpxData: string
    ): { lat: number; lon: number; ele?: number; time: string }[] {
    try {
      const parser = new DOMParser();
      const gpx = parser.parseFromString(gpxData, "application/xml");
      const trkpts = Array.from(gpx.getElementsByTagName("trkpt"));
      if (gpx.getElementsByTagName("parsererror").length || !trkpts.length) return [];

      return trkpts.map(trkpt => {
        const eleText = trkpt.getElementsByTagName("ele")[0]?.textContent ?? "";
        const eleNum = parseFloat(eleText);

        return {
          lat: parseFloat(trkpt.getAttribute("lat") ?? "0"),
          lon: parseFloat(trkpt.getAttribute("lon") ?? "0"),
          ...(Number.isFinite(eleNum) ? { ele: eleNum } : {}),
          time: trkpt.getElementsByTagName("time")[0]?.textContent ?? ""
        };
      });
    } catch {
      return [];
    }
  }


  private openInfoDialog(data: InfoDialogData): Promise<InfoDialogResult | undefined> {
    const dialogRef = this.dialog.open<InfoDialogComponent, InfoDialogData, InfoDialogResult>(InfoDialogComponent, {
      width: '420px',
      data
    });

    return firstValueFrom(dialogRef.afterClosed());
  }

  private showMessage(message: string, title = 'Aviso'): void {
    this.infoMessageService.showMessage({
      title,
      message
    });
  }

  private formatInvitationDate(rawDate?: string | null): string | null {
    if (!rawDate) return null;
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('es-ES', {
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
