import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { EventTrack, RaceEvent } from '../interfaces/events';

interface PersistedEvents {
  events: RaceEvent[];
}

@Injectable({ providedIn: 'root' })
export class EventService {
  private readonly storageKey = 'gpxEventsData';
  private readonly events$ = new BehaviorSubject<RaceEvent[]>([]);

  constructor(private http: HttpClient) {
    this.loadEvents();
  }

  getEvents(): Observable<RaceEvent[]> {
    return this.events$.asObservable();
  }

  getEvent(id: number): Observable<RaceEvent | undefined> {
    return this.getEvents().pipe(map(list => list.find(e => e.id === id)));
  }

  addEvent(event: RaceEvent): void {
    const updated = [...this.events$.value, this.normalizeEvent(event)];
    this.persist(updated);
    this.events$.next(updated);
  }

  addTrack(eventId: number, track: EventTrack): void {
    const updated = this.events$.value.map(event =>
      event.id === eventId ? { ...event, tracks: [...event.tracks, track] } : event
    );
    this.persist(updated);
    this.events$.next(updated);
  }

  removeTrack(eventId: number, trackId: number, requesterId: number): boolean {
    let removed = false;
    const updated = this.events$.value.map(event => {
      if (event.id !== eventId) return event;
      const track = event.tracks.find(t => t.id === trackId);
      if (!track) return event;
      if (track.createdBy && track.createdBy !== requesterId) return event;
      removed = true;
      return { ...event, tracks: event.tracks.filter(t => t.id !== trackId) };
    });

    if (removed) {
      this.persist(updated);
      this.events$.next(updated);
    }

    return removed;
  }

  removeEvent(eventId: number, requesterId: number): boolean {
    const event = this.events$.value.find(e => e.id === eventId);
    if (!event) return false;
    if (event.tracks.length) return false;
    if (event.createdBy && event.createdBy !== requesterId) return false;

    const updated = this.events$.value.filter(e => e.id !== eventId);
    this.persist(updated);
    this.events$.next(updated);
    return true;
  }

  private loadEvents(): void {
    const stored = this.readPersisted();
    if (stored?.events?.length) {
      this.events$.next(stored.events);
      return;
    }

    this.http.get<RaceEvent[]>('assets/events.json')
      .subscribe(events => {
        this.events$.next(this.normalizeEvents(events));
      });
  }

  private persist(events: RaceEvent[]): void {
    if (typeof localStorage === 'undefined') return;
    const payload: PersistedEvents = { events };
    localStorage.setItem(this.storageKey, JSON.stringify(payload));
  }

  private readPersisted(): PersistedEvents | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedEvents;
      if (parsed?.events?.length) {
        parsed.events = this.normalizeEvents(parsed.events);
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private normalizeEvents(events: RaceEvent[]): RaceEvent[] {
    return events.map(event => this.normalizeEvent(event));
  }

  private normalizeEvent(event: RaceEvent): RaceEvent {
    const location = (event as any).location as string | undefined;
    let population = event.population || '';
    let autonomousCommunity = event.autonomousCommunity || '';

    const routeId = Number(event.id);
    const modalities = (event.modalities || []).map(modality => ({
      ...modality,
      id: Number(modality.id),
      routeId: modality.routeId ?? routeId
    }));

    const tracks = (event.tracks || []).map(track => ({
      ...track,
      id: Number(track.id),
      routeId: track.routeId ?? routeId,
      modalityId: track.modalityId === null || track.modalityId === undefined
        ? null
        : Number(track.modalityId),
      createdBy: track.createdBy === undefined || track.createdBy === null
        ? track.createdBy ?? undefined
        : Number(track.createdBy)
    }));

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
      modalities,
      tracks
    };
  }
}
