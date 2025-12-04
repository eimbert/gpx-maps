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

  getEvent(id: string): Observable<RaceEvent | undefined> {
    return this.getEvents().pipe(map(list => list.find(e => e.id === id)));
  }

  addEvent(event: RaceEvent): void {
    const updated = [...this.events$.value, event];
    this.persist(updated);
    this.events$.next(updated);
  }

  addTrack(eventId: string, track: EventTrack): void {
    const updated = this.events$.value.map(event =>
      event.id === eventId ? { ...event, tracks: [...event.tracks, track] } : event
    );
    this.persist(updated);
    this.events$.next(updated);
  }

  private loadEvents(): void {
    const stored = this.readPersisted();
    if (stored?.events?.length) {
      this.events$.next(stored.events);
      return;
    }

    this.http.get<RaceEvent[]>('assets/events.json')
      .subscribe(events => {
        this.events$.next(events);
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
      return raw ? JSON.parse(raw) as PersistedEvents : null;
    } catch {
      return null;
    }
  }
}
