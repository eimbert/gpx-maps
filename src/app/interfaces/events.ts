export type RaceCategory =
  | 'Sub 23M' | 'Sub 23F'
  | 'Senior M' | 'Senior F'
  | 'Master 40M' | 'Master 40F'
  | 'Master 50M' | 'Master 50F'
  | 'Master 60M' | 'Master 60F'
  | null |  null;

export type BikeType = 'MTB' | 'Carretera' | 'Gravel' | 'e-Bike';

export interface EventModality {
  id: number;
  routeId?: number;
  name: string;
  distanceKm: number;
}

export interface EventTrack {
  id: number;
  routeId?: number | null;
  year?: number | null;
  nickname: string;
  category: RaceCategory;
  bikeType: BikeType;
  shared: boolean;
  modalityId?: number | null;
  timeSeconds: number;
  tiempoReal?: number;
  distanceKm: number;
  ascent?: number;
  population?: string | null;
  autonomousCommunity?: string | null;
  province?: string | null;
  startLat?: number | null;
  startLon?: number | null;
  gpxAsset?: string;
  gpxData?: string;
  fileName?: string;
  uploadedAt: string;
  duracionRecorrido?: string;
  createdBy?: number;
  title?: string | null;
  description?: string | null;
}

export interface TrackGpxFile {
  id: number;
  fileName?: string | null;
  routeXml?: string | null;
}

export interface RouteTrackTime {
  id: number;
  nickname: string;
  category: RaceCategory;
  bikeType: BikeType;
  distanceKm: number;
  tiempoReal: number;
}

export interface CreateEventPayload {
  name: string;
  population?: string | null;
  autonomousCommunity?: string | null;
  province?: string | null;
  year: number;
  distanceKm?: number | null;
  distante_km?: number | null;
  logoBlob?: string | null;
  logoMime?: string | null;
  gpxMaster?: string | null;
  gpxMasterFileName?: string | null;
  createdBy?: number;
}

export interface CreateTrackPayload {
  routeId: number | null;
  year?: number | null;
  nickname: string;
  category: RaceCategory;
  bikeType: BikeType;
  modalityId?: number | null;
  timeSeconds: number;
  tiempoReal?: number;
  distanceKm: number;
  ascent?: number;
  population?: string | null;
  autonomousCommunity?: string | null;
  province?: string | null;
  // startLatitude?: number | null;
  // startLongitude?: number | null;
  startLat?: number | null;
  startLon?: number | null;
  gpxAsset?: string;
  routeXml?: string;
  fileName?: string;
  uploadedAt: string;
  duracionRecorrido?: string;
  createdBy?: number;
  title?: string | null;
  shared?: boolean;
}

export interface RaceEvent {
  id: number;
  name: string;
  population?: string | null;
  autonomousCommunity?: string | null;
  province?: string | null;
  year: number;
  distanceKm?: number | null;
  distante_km?: number | null;
  //logo?: string;
  logoBlob?: string | null;
  logoMime?: string | null;
  gpxMaster?: string | null;
  gpxMasterFileName?: string | null;
  modalities: EventModality[];
  tracks: EventTrack[];
  createdBy?: number;
}
