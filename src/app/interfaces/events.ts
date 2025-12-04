export type RaceCategory =
  | 'Sub 23M' | 'Sub 23F'
  | 'Senior M' | 'Senior F'
  | 'Master 40M' | 'Master 40F'
  | 'Master 50M' | 'Master 50F'
  | 'Master 60M' | 'Master 60F';

export type BikeType = 'MTB' | 'Carretera' | 'Gravel' | 'Eléctrica';

export interface EventModality {
  id: string;
  name: string;
  distanceKm: number;
}

export interface EventTrack {
  id: string;
  nickname: string;
  category: RaceCategory;
  bikeType: BikeType;
  modalityId: string;
  timeSeconds: number;
  distanceKm: number;
  ascent?: number;
  gpxAsset?: string;
  gpxData?: string;
  fileName?: string;
  uploadedAt: string;
}

export interface RaceEvent {
  id: string;
  name: string;
  population: string;
  autonomousCommunity: string;
  year: number;
  logo?: string;
  modalities: EventModality[];
  tracks: EventTrack[];
}
