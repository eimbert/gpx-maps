import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of, tap } from 'rxjs';
import { CreateEventPayload, CreateTrackPayload, EventTrack, RaceEvent } from '../interfaces/events';
import { environment } from '../../environments/environment';

type CreateEventResponse = {
  exitCode: number;
  id: number;
  message?: string | null;
};


@Injectable({ providedIn: 'root' })
export class EventService {
  
  private readonly events$ = new BehaviorSubject<RaceEvent[]>([]);
  private readonly routesApiBase = environment.routesApiBase;

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


  addTrack(eventId: number, track: CreateTrackPayload): Observable<EventTrack> {
    return this.http.post<EventTrack>(`${this.routesApiBase}/${eventId}/tracks`, track).pipe(
      map(created => this.normalizeTrack(created, eventId)),
      tap(created => {
        const updated = this.events$.value.map(event =>
          event.id === eventId ? { ...event, tracks: [...event.tracks, created] } : event
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
      modalities,
      tracks,
      
    };
  }

  private normalizeTrack(track: EventTrack, routeId: number): EventTrack {
    return {
      ...track,
      id: Number(track.id),
      routeId: track.routeId ?? routeId,
      modalityId: track.modalityId === null || track.modalityId === undefined
        ? null
      : Number(track.modalityId),
      createdBy: track.createdBy === undefined || track.createdBy === null
        ? track.createdBy ?? undefined
        : Number(track.createdBy)
    };
  }

  private buildLogoDataUrl(logoBlob?: string | null, logoMime?: string | null): string | undefined {
    if (!logoBlob) return undefined;
    const mime = (logoMime || 'image/png').trim();
    return `data:${mime};base64,${logoBlob}`;
  }
}
