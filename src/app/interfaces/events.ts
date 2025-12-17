export type RaceCategory =
  | 'Sub 23M' | 'Sub 23F'
  | 'Senior M' | 'Senior F'
  | 'Master 40M' | 'Master 40F'
  | 'Master 50M' | 'Master 50F'
  | 'Master 60M' | 'Master 60F';

export type BikeType = 'MTB' | 'Carretera' | 'Gravel' | 'e-Bike';

export interface EventModality {
  id: number;
  routeId?: number;
  name: string;
  distanceKm: number;
}

export interface EventTrack {
  id: number;
  routeId?: number;
  nickname: string;
  category: RaceCategory;
  bikeType: BikeType;
  modalityId?: number | null;
  timeSeconds: number;
  distanceKm: number;
  ascent?: number;
  gpxAsset?: string;
  gpxData?: string;
  fileName?: string;
  uploadedAt: string;
  createdBy?: number;
}

export interface CreateEventPayload {
  name: string;
  population?: string | null;
  autonomousCommunity?: string | null;
  year: number;
  logoBlob?: string | null;
  logoMime?: string | null;
  createdBy?: number;
}

export interface CreateTrackPayload {
  nickname: string;
  category: RaceCategory;
  bikeType: BikeType;
  modalityId?: number | null;
  timeSeconds: number;
  distanceKm: number;
  ascent?: number;
  gpxAsset?: string;
  gpxData?: string;
  fileName?: string;
  uploadedAt: string;
  createdBy?: number;
}

export interface RaceEvent {
  id: number;
  name: string;
  population?: string | null;
  autonomousCommunity?: string | null;
  year: number;
  //logo?: string;
  logoBlob?: string | null;
  logoMime?: string | null;
  modalities: EventModality[];
  tracks: EventTrack[];
  createdBy?: number;
}


