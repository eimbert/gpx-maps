import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
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

  folderSearch = '';
  showNewFolderForm = false;
  newFolderName = '';
  newFolderDate: string | null = null;
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
    identityService: UserIdentityService
  ) {
    this.userId = identityService.getUserId();
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
      this.applyFolderFilter();
      if (!this.activeFolder && folders.length) {
        this.selectFolder(folders[0]);
      }
      this.isLoadingFolders = false;
    });
  }

  applyFolderFilter(): void {
    const search = this.folderSearch.trim().toLowerCase();
    this.filteredFolders = this.folders.filter(folder =>
      folder.name.toLowerCase().includes(search)
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
        plannedDate: this.newFolderDate || null,
        observations: this.newFolderNotes.trim() || null
      })
      .subscribe(folder => {
        this.folders = [folder, ...this.folders];
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
      plannedDate: this.toDateInput(folder.plannedDate),
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

    this.isSavingFolder = true;
    this.planService
      .updateFolder(this.activeFolder.id, {
        name: this.editFolder.name.trim(),
        plannedDate: this.editFolder.plannedDate || null,
        observations: this.editFolder.observations?.trim() || null
      })
      .subscribe(updated => {
        this.folders = this.folders.map(folder => (folder.id === updated.id ? updated : folder));
        this.applyFolderFilter();
        this.activeFolder = updated;
        this.editFolder = {
          name: updated.name,
          plannedDate: this.toDateInput(updated.plannedDate),
          observations: updated.observations
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

  loadTracks(folderId: number): void {
    this.isLoadingTracks = true;
    this.planService.getTracks(folderId).subscribe(tracks => {
      this.tracks = tracks;
      this.isLoadingTracks = false;
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
    if (!summary) return '';
    return `Predicción ${summary.date}`;
  }

  resolveWeatherIcon(trackId: number): string {
    const summary = this.weatherByTrackId.get(trackId);
    if (!summary) return 'help_outline';
    return this.mapWeatherIcon(summary.weatherCode);
  }

  resolveWeatherCategory(trackId: number): string {
    const summary = this.weatherByTrackId.get(trackId);
    if (!summary) return 'Sin datos';
    return this.mapWeatherCategory(summary.weatherCode);
  }

  resolveWeatherTemperature(trackId: number): string {
    const summary = this.weatherByTrackId.get(trackId);
    if (!summary) return '—';
    return `${summary.minTemp}°/${summary.maxTemp}°`;
  }

  resolveMapsLink(track: PlanTrack): string | null {
    if (track.startLat === null || track.startLon === null) return null;
    return `https://www.google.com/maps/search/?api=1&query=${track.startLat},${track.startLon}`;
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

  private refreshForecasts(): void {
    this.weatherByTrackId.clear();
    const plannedDate = this.editFolder?.plannedDate;
    if (!plannedDate) return;

    this.tracks.forEach(track => {
      if (track.startLat === null || track.startLon === null) return;

      this.fetchForecast(track.startLat, track.startLon, plannedDate)
        .pipe(takeUntil(this.destroy$))
        .subscribe(summary => {
          if (summary) {
            this.weatherByTrackId.set(track.id, summary);
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
    if (code === 0 || code === 1) return 'wb_sunny';
    if ([2, 3, 45, 48].includes(code)) return 'cloud';
    if ((code >= 51 && code <= 65) || (code >= 80 && code <= 82) || (code >= 71 && code <= 75)) return 'grain';
    if (code >= 95) return 'thunderstorm';
    return 'cloud';
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

  private toDateInput(value: string | null): string | null {
    if (!value) return null;
    return value.split('T')[0];
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
