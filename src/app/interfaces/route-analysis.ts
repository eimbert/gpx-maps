export type RouteAnalysisType = 'rodadora' | 'tecnica' | 'subida_dura' | 'mixta' | 'suave' | 'exigente';

export type RouteAnalysisHighlightType = 'climb' | 'descent' | 'technical' | 'fast' | 'warning' | 'landmark';

export type RouteAnalysisSeverity = 'low' | 'medium' | 'high';

export interface RouteAnalysisHighlight {
  title: string;
  description: string;
  kmStart: number;
  kmEnd?: number | null;
  lat?: number | null;
  lon?: number | null;
  type: RouteAnalysisHighlightType;
  severity: RouteAnalysisSeverity;
}

export interface RouteAnalysisReport {
  summary: string;
  routeType: RouteAnalysisType;
  difficultyExplanation: string;
  highlights: RouteAnalysisHighlight[];
  warnings: string[];
  recommendations: string[];
  sectors?: RouteAnalysisSector[];
  approaches?: RouteAnalysisApproaches;
}

export interface RouteAnalysisSector {
  name: string;
  kmStart: number;
  kmEnd: number;
  focus: string;
  effort: 'suave' | 'medio' | 'alto' | 'critico';
}

export interface RouteAnalysisApproaches {
  recreational?: string[];
  training?: string[];
  competition?: string[];
}

export interface RouteAnalysis {
  id?: number | null;
  trackId?: number | null;
  userId?: number | null;
  gpxHash?: string | null;
  analysisVersion?: string | null;
  model?: string | null;
  fallbackReason?: string | null;
  userInstructions?: string | null;
  elevationSource?: string | null;
  routeStats?: RouteAnalysisStats | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  title?: string | null;
  fileName?: string | null;
  usageCharged?: boolean;
  reusedExisting?: boolean;
  report: RouteAnalysisReport;
}

export interface PublicRouteAnalysis extends RouteAnalysis {
  title: string;
}

export interface RouteAnalysisElevationPoint {
  distanceKm: number;
  elevationM: number;
}

export interface RouteAnalysisStats {
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  minEleM: number;
  maxEleM: number;
  elevationProfile: RouteAnalysisElevationPoint[];
}

export interface RouteAnalysisRequest {
  trackId?: number | null;
  source?: 'upload' | 'tracks' | 'plan';
  fileName?: string | null;
  title?: string | null;
  routeXml: string;
  userInstructions?: string | null;
  forceRefresh?: boolean;
}
