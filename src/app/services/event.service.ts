import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of, tap } from 'rxjs';
import { CreateEventPayload, CreateTrackPayload, EventTrack, RaceEvent, RouteTrackTime, TrackGpxFile } from '../interfaces/events';
import { environment } from '../../environments/environment';

type CreateEventResponse = {
  exitCode: number;
  id: number;
  message?: string | null;
};
type UpdateGpxMasterPayload = {
  gpxMaster: string;
  gpxMasterFileName?: string | null;
};


@Injectable({ providedIn: 'root' })
export class EventService {
  
  private readonly events$ = new BehaviorSubject<RaceEvent[]>([]);
  private readonly routesApiBase = environment.routesApiBase;
  private readonly tracksApiBase = environment.tracksApiBase;

  constructor(private http: HttpClient) {
    this.refreshEvents().subscribe();
  }

  getEvents(): Observable<RaceEvent[]> {
    return this.events$.asObservable();
  }

  getEvent(id: number): Observable<RaceEvent | undefined> {
    return this.getEvents().pipe(map(list => list.find(e => e.id === id)));
  }

  refreshEvents(): Observable<RaceEvent[]> {
    return this.http.get<RaceEvent[]>(this.routesApiBase).pipe(
      map(events => this.normalizeEvents(events)),
      tap(events => this.events$.next(events)),
      catchError(() => this.loadFallbackEvents())
    );
  }

  createEvent(payload: CreateEventPayload): Observable<RaceEvent> {
    console.log("antes del post: ", payload)
    return this.http.post<CreateEventResponse>(this.routesApiBase, payload).pipe(
      map(res => {
        if (res.exitCode !== 0) {
          throw new Error(res.message ?? 'Error creando el evento');
        }

        // Construye el evento a partir del payload (lo que acabas de enviar)
        const event: RaceEvent = {
          ...(payload as any),
          id: res.id
        };

        return this.normalizeEvent(event);
      }),
      tap(event => this.events$.next([...this.events$.value, event]))
    );
  }

  updateGpxMaster(routeId: number, payload: UpdateGpxMasterPayload): Observable<RaceEvent> {
    return this.http.put<RaceEvent>(`${this.routesApiBase}/${routeId}/gpx-master`, payload).pipe(
      map(event => this.normalizeEvent(event)),
      tap(event => {
        const updated = this.events$.value.map(current => current.id === event.id ? event : current);
        this.events$.next(updated);
      })
    );
  }


  addTrack(track: CreateTrackPayload): Observable<EventTrack> {
    const routeId = track.routeId;
    return this.http.post<EventTrack>(`${this.tracksApiBase}`, track).pipe(
      map(created => this.normalizeTrack(created, routeId)),
      tap(created => {
        const updated = this.events$.value.map(event =>
          event.id === routeId ? { ...event, tracks: [...event.tracks, created] } : event
        );
        this.events$.next(updated);
      })
    );
  }

  removeTrack(eventId: number, trackId: number, requesterId: number): Observable<boolean> {
    const event = this.events$.value.find(e => e.id === eventId);
    const track = event?.tracks.find(t => t.id === trackId);
    if (!event || !track) return of(false);
    if (track.createdBy && track.createdBy !== requesterId) return of(false);

    return this.http.delete<void>(`${this.routesApiBase}/${eventId}/tracks/${trackId}`).pipe(
      tap(() => {
        const updated = this.events$.value.map(current =>
          current.id === eventId ? { ...current, tracks: current.tracks.filter(t => t.id !== trackId) } : current
        );
        this.events$.next(updated);
      }),
      map(() => true),
      catchError(() => of(false))
    );
  }

  removeEvent(eventId: number, requesterId: number): Observable<boolean> {
    const event = this.events$.value.find(e => e.id === eventId);
    if (!event || event.tracks.length) return of(false);
    if (event.createdBy && event.createdBy !== requesterId) return of(false);

    return this.http.delete<void>(`${this.routesApiBase}/${eventId}`).pipe(
      tap(() => {
        this.events$.next(this.events$.value.filter(e => e.id !== eventId));
      }),
      map(() => true),
      catchError(() => of(false))
    );
  }

  getRouteTrackTimes(routeId: number): Observable<RouteTrackTime[]> {
    return this.http.get<RouteTrackTime[]>(`${this.tracksApiBase}/route/${routeId}`).pipe(
      map(list => list.map(item => ({
        ...item,
        id: Number(item.id),
        distanceKm: Number(item.distanceKm),
        tiempoReal: Number(item.tiempoReal)
      }))),
      catchError(() => of([]))
    );
  }

  getMyTracks(): Observable<EventTrack[]> {
    return this.http.get<EventTrack[]>(`${this.tracksApiBase}/me`).pipe(
      map(tracks => (tracks || []).map(track => {
        const routeId = this.resolveTrackRouteId(track);
        return this.normalizeTrack(track, routeId);
      }))
    );
  }

  getTrackGpx(trackId: number): Observable<TrackGpxFile> {
    return this.http.get<TrackGpxFile>(`${this.tracksApiBase}/${trackId}/gpx`).pipe(
      map(res => ({
        id: Number(res.id),
        fileName: res.fileName ?? null,
        routeXml: res.routeXml ?? null
      }))
    );
  }

  private loadFallbackEvents(): Observable<RaceEvent[]> {
    return this.http.get<RaceEvent[]>('assets/events.json').pipe(
      map(events => this.normalizeEvents(events)),
      tap(events => this.events$.next(events)),
      catchError(() => of([] as RaceEvent[]))
    );
  }

  private normalizeEvents(events: RaceEvent[]): RaceEvent[] {
    return events.map(event => this.normalizeEvent(event));
  }

  private normalizeEvent(event: RaceEvent): RaceEvent {
    console.log("EVENT: ", event)
    const location = (event as any).location as string | undefined;
    let population = event.population || '';
    let autonomousCommunity = event.autonomousCommunity || '';
    const logoBlob = event.logoBlob ?? null;
    console.log("LOGOBLOB: ", logoBlob)
    console.log("event. LOGOBLOB: ", event.logoBlob)
    const logoMime = (event as any).logoMime ?? null;
    const logo = event.logoBlob || this.buildLogoDataUrl(logoBlob, logoMime);
    console.log("LOGO: ", logo)
    const gpxMaster = (event as any).gpxMaster ?? (event as any).gpx_master ?? null;
    const gpxMasterFileName = (event as any).gpxMasterFileName ?? (event as any).gpx_master_file_name ?? null;

    const routeId = Number(event.id);
    const modalities = (event.modalities || []).map(modality => ({
      ...modality,
      id: Number(modality.id),
      routeId: modality.routeId ?? routeId
    }));

    const tracks = (event.tracks || []).map(track => this.normalizeTrack(track, routeId));

    if (location && (!population || !autonomousCommunity)) {
      const [locPopulation, locCommunity] = location.split(',').map(p => p.trim());
      population = population || locPopulation || '';
      autonomousCommunity = autonomousCommunity || locCommunity || '';
    }

    return {
      ...event,
      id: routeId,
      population,
      autonomousCommunity,
      logoBlob,
      logoMime,
      gpxMaster,
      gpxMasterFileName,
      modalities,
      tracks,
      
    };
  }

  private normalizeTrack(track: EventTrack, routeId: number): EventTrack {
    const timeSeconds = Number(track.timeSeconds);
    const tiempoReal = track.tiempoReal === undefined || track.tiempoReal === null
      ? track.tiempoReal ?? undefined
      : Number(track.tiempoReal);
    const distanceKm = Number(track.distanceKm);

    return {
      ...track,
      id: Number(track.id),
      timeSeconds: Number.isFinite(timeSeconds) ? timeSeconds : 0,
      tiempoReal: tiempoReal === undefined || Number.isFinite(tiempoReal) ? tiempoReal : undefined,
      distanceKm: Number.isFinite(distanceKm) ? distanceKm : 0,
      routeId: track.routeId ?? routeId,
      modalityId: track.modalityId === null || track.modalityId === undefined
        ? null
      : Number(track.modalityId),
      createdBy: track.createdBy === undefined || track.createdBy === null
        ? track.createdBy ?? undefined
        : Number(track.createdBy)
    };
  }

  private resolveTrackRouteId(track: EventTrack): number {
    const routeId = (track as any).routeId ?? (track as any).route_id ?? 0;
    const numericId = Number(routeId);
    return Number.isFinite(numericId) ? numericId : 0;
  }

  private buildLogoDataUrl(logoBlob?: string | null, logoMime?: string | null): string | undefined {
    if (!logoBlob) return undefined;
    const mime = (logoMime || 'image/png').trim();
    return `data:${mime};base64,${logoBlob}`;
  }
}
