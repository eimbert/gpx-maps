import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Subject, debounceTime, firstValueFrom, map, switchMap, takeUntil } from 'rxjs';
import { InfoDialogComponent, InfoDialogData, InfoDialogResult } from '../info-dialog/info-dialog.component';
import { PlanService } from '../services/plan.service';
import { GpxImportService } from '../services/gpx-import.service';
import { UserIdentityService } from '../services/user-identity.service';
import {
  PlanFolder,
  PlanFolderVotesResponse,
  PlanTrack,
  PlanUserSearchResult,
  TrackWeatherSummary
} from '../interfaces/plan';

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
  inviteResults: PlanUserSearchResult[] = [];
  inviteStatusMessage = '';

  isLoadingFolders = false;
  isSavingFolder = false;
  isLoadingTracks = false;
  isImportingTrack = false;

  private readonly destroy$ = new Subject<void>();
  private readonly inviteSearch$ = new Subject<string>();
  private readonly userId: number;

  constructor(
    private planService: PlanService,
    private http: HttpClient,
    private dialog: MatDialog,
    private gpxImportService: GpxImportService,
    private router: Router,
    identityService: UserIdentityService
  ) {
    this.userId = identityService.getUserId();
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  ngOnInit(): void {
    this.loadFolders();

    this.inviteSearch$
      .pipe(
        debounceTime(250),
        switchMap(query => this.planService.searchUsers(query)),
        takeUntil(this.destroy$)
      )
      .subscribe(results => {
        this.inviteResults = results;
        this.inviteStatusMessage = results.length ? '' : (this.inviteQuery ? 'No se encontraron usuarios.' : '');
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
      this.applyFolderFilter();
      if (!this.activeFolder && folders.length) {
        this.selectFolder(folders[0]);
      }
      this.isLoadingFolders = false;
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
        this.tracks = [...this.tracks, track];
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

    this.planService
      .inviteUser(this.activeFolder.id, {
        invitedUserId: user.id,
        invitedEmail: user.email,
        role: 'editor'
      })
      .subscribe(() => {
        this.inviteStatusMessage = `Invitación enviada a ${user.name || user.email}.`;
        this.inviteResults = [];
        this.inviteQuery = '';
      });
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

    return folder.ownerUserId !== this.userId ? 'Compartida' : 'Privada';
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

  canVoteOnTracks(): boolean {
    if (!this.activeFolder) return false;
    if (this.tracks.length < 2) return false;
    const hasOtherUserTracks = this.tracks.some(track => track.createdByUserId !== this.userId);
    const isOwner = this.activeFolder.ownerUserId === this.userId;
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
      route_xml: gpxData
    };
  }

  private parseTrackPointsFromGpx(gpxData: string): { lat: number; lon: number; ele: number; time: string }[] {
    try {
      const parser = new DOMParser();
      const gpx = parser.parseFromString(gpxData, 'application/xml');
      const trkpts = Array.from(gpx.getElementsByTagName('trkpt'));
      if (gpx.getElementsByTagName('parsererror').length || !trkpts.length) return [];
      return trkpts.map(trkpt => ({
        lat: parseFloat(trkpt.getAttribute('lat') || '0'),
        lon: parseFloat(trkpt.getAttribute('lon') || '0'),
        ele: parseFloat(trkpt.getElementsByTagName('ele')[0]?.textContent || '0'),
        time: trkpt.getElementsByTagName('time')[0]?.textContent || ''
      }));
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
    void this.openInfoDialog({
      title,
      message
    });
  }
}
