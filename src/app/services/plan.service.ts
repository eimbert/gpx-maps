import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  PlanFolder,
  PlanFolderVotesResponse,
  PlanInvitation,
  PlanTrack,
  PlanUserSearchResult,
  PlanVoteSummary
} from '../interfaces/plan';

type PlanFolderPayload = {
  name: string;
  plannedDate?: string | null;
  observations?: string | null;
};

type InvitePayload = {
  invitedUserId?: number | null;
  invitedEmail?: string | null;
  role: 'editor' | 'viewer';
};

type VoteResponse = {
  votes?: PlanVoteSummary[];
  userVoteTrackId?: number | null;
};

export type PlanTrackImportPayload = {
  folder_id: number;
  created_by_user_id: number;
  name: string;
  start_lat: number | null;
  start_lon: number | null;
  start_population: string | null;
  distance_km: number | null;
  moving_time_sec: number | null;
  total_time_sec: number | null;
  route_xml: string;
};

@Injectable({ providedIn: 'root' })
export class PlanService {
  private readonly planApiBase = environment.planApiBase;
  private readonly usersApiBase = environment.usersApiBase;

  constructor(private http: HttpClient) {}

  getFolders(): Observable<PlanFolder[]> {
    return this.http.get<PlanFolder[]>(this.planApiBase).pipe(
      map(list => (list || []).map(folder => this.normalizeFolder(folder))),
      catchError(() => of([]))
    );
  }

  createFolder(payload: PlanFolderPayload): Observable<PlanFolder> {
    return this.http.post<PlanFolder>(this.planApiBase, payload).pipe(
      map(folder => this.normalizeFolder(folder))
    );
  }

  updateFolder(folderId: number, payload: PlanFolderPayload): Observable<PlanFolder> {
    return this.http.put<PlanFolder>(`${this.planApiBase}/${folderId}`, payload).pipe(
      map(folder => this.normalizeFolder(folder))
    );
  }

  deleteFolder(folderId: number): Observable<void> {
    return this.http.delete<void>(`${this.planApiBase}/${folderId}`);
  }

  getTracks(folderId: number): Observable<PlanTrack[]> {
    return this.http.get<PlanTrack[]>(`${this.planApiBase}/${folderId}/tracks`).pipe(
      map(list => (list || []).map(track => this.normalizeTrack(track))),
      catchError(() => of([]))
    );
  }

  importTrack(payload: PlanTrackImportPayload): Observable<PlanTrack> {
    console.log('Plan track import payload:', payload);
    return this.http.post<PlanTrack>(`${this.planApiBase}/tracks/import`, payload).pipe(
      map(track => this.normalizeTrack(track))
    );
  }

  deleteTrack(trackId: number): Observable<void> {
    return this.http.delete<void>(`${this.planApiBase}/tracks/${trackId}`);
  }

  getVotes(folderId: number): Observable<PlanFolderVotesResponse> {
    return this.http.get<VoteResponse>(`${this.planApiBase}/${folderId}/votes`).pipe(
      map(response => ({
        votes: response.votes ?? [],
        userVoteTrackId: response.userVoteTrackId ?? null
      })),
      catchError(() => of({ votes: [], userVoteTrackId: null }))
    );
  }

  voteTrack(folderId: number, trackId: number): Observable<PlanFolderVotesResponse> {
    return this.http.post<VoteResponse>(`${this.planApiBase}/${folderId}/votes`, { trackId }).pipe(
      map(response => ({
        votes: response.votes ?? [],
        userVoteTrackId: response.userVoteTrackId ?? trackId
      }))
    );
  }

  removeVote(folderId: number): Observable<PlanFolderVotesResponse> {
    return this.http.delete<VoteResponse>(`${this.planApiBase}/${folderId}/votes`).pipe(
      map(response => ({
        votes: response.votes ?? [],
        userVoteTrackId: response.userVoteTrackId ?? null
      }))
    );
  }

  searchUsers(query: string): Observable<{ users: PlanUserSearchResult[]; notFound: boolean }> {
    if (!query.trim()) return of({ users: [], notFound: false });
    return this.http
      .get<PlanUserSearchResult | PlanUserSearchResult[]>(`${this.usersApiBase}/search`, { params: { q: query } })
      .pipe(
        tap(response => console.log('Plan user search response:', response)),
        map(response => {
          const list = Array.isArray(response) ? response : response ? [response] : [];
          return {
            users: list.map(user => ({
              ...user,
              id: Number(user.id)
            })),
            notFound: list.length === 0
          };
        }),
        catchError(error => of({ users: [], notFound: error?.status === 403 }))
      );
  }

  inviteUser(folderId: number, payload: InvitePayload): Observable<PlanInvitation> {
    return this.http.post<PlanInvitation>(`${this.planApiBase}/${folderId}/invitations`, payload);
  }

  getInvitations(folderId: number): Observable<PlanInvitation[]> {
    return this.http.get<PlanInvitation[]>(`${this.planApiBase}/${folderId}/invitations`).pipe(
      map(list => list ?? []),
      catchError(() => of([]))
    );
  }

  revokeInvitation(folderId: number, invitationId: number): Observable<void> {
    return this.http.delete<void>(`${this.planApiBase}/${folderId}/invitations/${invitationId}`);
  }

  private normalizeFolder(folder: PlanFolder): PlanFolder {
    const ownerUserId = Number(folder.ownerUserId ?? (folder as any).owner_user_id);
    const tracksCountRaw = (folder as any).tracksCount
      ?? (folder as any).trackCount
      ?? (folder as any).tracks_count
      ?? (folder as any).track_count;
    const tracksCount = Number.isFinite(Number(tracksCountRaw)) ? Number(tracksCountRaw) : undefined;
    const sharedRaw = (folder as any).shared ?? (folder as any).isShared ?? (folder as any).is_shared;
    return {
      ...folder,
      id: Number(folder.id),
      ownerUserId: Number.isFinite(ownerUserId) ? ownerUserId : 0,
      plannedDate: folder.plannedDate ?? (folder as any).planned_date ?? null,
      observations: folder.observations ?? (folder as any).observations ?? null,
      createdAt: folder.createdAt ?? (folder as any).created_at,
      updatedAt: folder.updatedAt ?? (folder as any).updated_at,
      tracksCount,
      shared: sharedRaw === undefined || sharedRaw === null ? undefined : Boolean(sharedRaw)
    };
  }

  private normalizeTrack(track: PlanTrack): PlanTrack {
    const createdByUserId = Number(track.createdByUserId ?? (track as any).created_by_user_id);
    return {
      ...track,
      id: Number(track.id),
      folderId: Number(track.folderId ?? (track as any).folder_id),
      createdByUserId: Number.isFinite(createdByUserId) ? createdByUserId : 0,
      name: track.name ?? (track as any).title ?? '',
      startLat: track.startLat ?? (track as any).start_lat ?? null,
      startLon: track.startLon ?? (track as any).start_lon ?? null,
      startPopulation: track.startPopulation ?? (track as any).start_population ?? null,
      distanceKm: track.distanceKm ?? (track as any).distance_km ?? null,
      movingTimeSec: track.movingTimeSec ?? (track as any).moving_time_sec ?? null,
      totalTimeSec: track.totalTimeSec ?? (track as any).total_time_sec ?? null,
      howToGetUrl: track.howToGetUrl ?? (track as any).how_to_get_url ?? null,
      sourceType: track.sourceType ?? (track as any).source_type ?? null,
      routeXml: track.routeXml ?? (track as any).routeXml ?? null,
      sortOrder: track.sortOrder ?? (track as any).sort_order ?? null,
      createdAt: track.createdAt ?? (track as any).created_at
    };
  }
}
