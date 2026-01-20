import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Observable, Subject, debounceTime, firstValueFrom, forkJoin, map, switchMap, takeUntil } from 'rxjs';
import { InfoDialogComponent, InfoDialogData, InfoDialogResult } from '../info-dialog/info-dialog.component';
import { PlanService, PlanTrackImportPayload } from '../services/plan.service';
import { GpxImportService } from '../services/gpx-import.service';
import { InfoMessageService } from '../services/info-message.service';
import { UserIdentityService } from '../services/user-identity.service';
import {
  PlanFolder,
  PlanFolderVotesResponse,
  PlanInvitation,
  PlanTrack,
  PlanUserSearchResult,
  TrackWeatherSummary
} from '../interfaces/plan';
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
  votesByTrackId = new Map<number, number>();
  userVoteTrackId: number | null = null;
  weatherByTrackId = new Map<number, TrackWeatherSummary>();
  folderTrackCounts = new Map<number, number>();
  forecastNotice = '';

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

  constructor(
    private planService: PlanService,
    private http: HttpClient,
    private dialog: MatDialog,
    private gpxImportService: GpxImportService,
    private router: Router,
    private infoMessageService: InfoMessageService,
    identityService: UserIdentityService
  ) {
    this.userId = identityService.getUserId();
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  ngOnInit(): void {
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
          ? 'No se encuentra ningún usuario con ese nick.'
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
      const userId = JSON.parse(localStorage.getItem('gpxAuthSession') ?? 'null')?.id;
      console.log("mi id: ", userId )
      
      folders.forEach(f => {
        if(userId == f.ownerId) f.isOwner = true
      });
      this.folders = folders;
      console.log("carpetas: ", folders)
      this.folderTrackCounts.clear();
      folders.forEach(folder => {
        if (Number.isFinite(folder.tracksCount ?? NaN)) {
          this.folderTrackCounts.set(folder.id, Number(folder.tracksCount));
        }
      });
      this.applyFolderFilter();
      if (!this.activeFolder && folders.length) {
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
    if (!this.newFolderName.trim()) {
      this.showMessage('Añade un nombre para crear la carpeta.');
      return;
    }

    this.planService
      .createFolder({
        name: this.newFolderName.trim(),
        plannedDate: this.formatDateForApi(this.newFolderDate),
        observations: this.newFolderNotes.trim() || null
      })
      .subscribe(folder => {
        this.folders = [folder, ...this.folders];
        this.folderTrackCounts.set(folder.id, 0);
        this.applyFolderFilter();
        this.selectFolder(folder);
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
    this.loadVotes(folder.id);
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
        const mergedFolder: PlanFolder = {
          ...this.activeFolder,
          ...updated,
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
      message: `¿Seguro que quieres eliminar “${folder.name}”? Se borrarán también sus tracks.`,
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
    const decision = await this.openInfoDialog({
      title: 'Eliminar track',
      message: `¿Seguro que quieres eliminar “${track.name}” de esta carpeta?`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar'
    });

    if (decision !== 'confirm') return;
    this.planService.deleteTrack(track.id).subscribe(() => {
      this.tracks = this.tracks.filter(current => current.id !== track.id);
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
    this.planService.getTracks(folderId).subscribe(tracks => {
      this.tracks = tracks;
      this.isLoadingTracks = false;
      this.updateFolderTrackCountCache(folderId, tracks.length);
      this.refreshForecasts();
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
      this.loadInvitations(folderId);
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
      ? this.planService.removeVote(this.activeFolder.id)
      : this.planService.voteTrack(this.activeFolder.id, track.id);

    action$.subscribe(response => {
      this.applyVotes(response);
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
    const sourceTable = (folder.sourceTable ?? '').toLowerCase();
    if (sourceTable) {
      return sourceTable === 'pla_folders';
    }
    if (folder.isOwner !== undefined) {
      return folder.isOwner;
    }
    return folder.ownerId === this.userId;
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

  canVoteOnTracks(): boolean {
    if (!this.activeFolder) return false;
    if (this.tracks.length < 2) return false;
    const hasOtherUserTracks = this.tracks.some(track => track.createdByUserId !== this.userId);
    const isOwner = this.activeFolder.ownerId === this.userId;
    return !isOwner || hasOtherUserTracks;
  }

  canAnimateTrack(track: PlanTrack): boolean {
    return !!track.routeXml;
  }

  async animateTrack(track: PlanTrack): Promise<void> {
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
      rmstops: false,
      marcarPausasLargas: false,
      umbralPausaSegundos: 60,
      activarMusica: true,
      grabarAnimacion: false,
      relacionAspectoGrabacion: '16:9',
      modoVisualizacion: 'general',
      mostrarPerfil: true
    };

    sessionStorage.setItem('gpxViewerPayload', JSON.stringify(payload));
    this.router.navigate(['/map'], { queryParams: { from: 'plan' } });
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
    return invitation.status === 'pending' && !!userId;
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
    const desnivel = this.calculateTotalAscent(trkpts);

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

  private toFiniteOrNull(v: unknown): number | null {
    return Number.isFinite(v) ? (v as number) : null;
  }

  private calculateTotalAscent(trkpts: { ele?: number }[]): number {
    if (!trkpts.length) return 0;

    let totalAscent = 0;
    let previousElevation: number | null = this.toFiniteOrNull(trkpts[0].ele);

    for (let i = 1; i < trkpts.length; i++) {
      const currentElevation: number | null = this.toFiniteOrNull(trkpts[i].ele);

      if (currentElevation === null) continue;

      if (previousElevation !== null) {
        const diff = currentElevation - previousElevation;
        if (diff > 0) totalAscent += diff;
      }

      previousElevation = currentElevation;
    }

    return totalAscent;
  }

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
