export interface PlanFolder {
  id: number;
  ownerUserId: number;
  name: string;
  plannedDate: string | null;
  observations: string | null;
  createdAt: string;
  updatedAt: string;
  tracksCount?: number;
  shared?: boolean;
}

export interface PlanTrack {
  id: number;
  folderId: number;
  createdByUserId: number;
  name: string;
  startLat: number | null;
  startLon: number | null;
  startPopulation: string | null;
  distanceKm: number | null;
  movingTimeSec: number | null;
  totalTimeSec: number | null;
  howToGetUrl: string | null;
  sourceType: string | null;
  sortOrder: number | null;
  createdAt: string;
  routeXml: string;
  votesCount?: number;
}

export interface PlanFolderMember {
  id: number;
  folderId: number;
  userId: number;
  role: 'owner' | 'editor' | 'viewer';
  canVote: boolean;
  joinedAt: string;
}

export interface PlanInvitation {
  id: number;
  folderId: number;
  invitedUserId?: number | null;
  invitedEmail?: string | null;
  invitedByUserId: number;
  role: 'editor' | 'viewer';
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
  token: string;
  createdAt: string;
  respondedAt?: string | null;
  expiresAt?: string | null;
}

export interface PlanVoteSummary {
  trackId: number;
  votes: number;
}

export interface PlanFolderVotesResponse {
  votes: PlanVoteSummary[];
  userVoteTrackId: number | null;
}

export interface PlanUserSearchResult {
  id: number;
  name?: string | null;
  email: string;
}

export interface TrackWeatherSummary {
  date: string;
  weatherCode: number;
  maxTemp: number;
  minTemp: number;
}
