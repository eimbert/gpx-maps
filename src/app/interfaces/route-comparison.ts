export interface EffortClimb {
  startKm: number; endKm: number; distanceKm: number; gainM: number; averageGrade: number;
  max100: number | null; max250: number | null; max500: number | null; character: string[]; segment: number;
}
export interface EffortDimensions {
  overall: number; endurance: number; explosiveness: number; accumulatedFatigue: number; regularity: number; finalDemand: number;
}
export interface EffortMetrics {
  elevationQuality?: 'A' | 'B' | 'C' | null;
  version: string; distanceKm: number; gainM: number | null; lossM: number | null;
  minAltitude: number | null; maxAltitude: number | null; elevationStatus: string; coveragePercent: number;
  uphillAverageGrade: number | null; max100: number | null; max250: number | null; max500: number | null;
  uphillPercent: number | null; downhillPercent: number | null; flatPercent: number | null;
  climbCount: number; descentCount: number; punchCount: number; punchesPerKm: number; directionChanges: number;
  sharpGradeChanges: number; meanRecoveryM: number | null; chainedClimbs: number; finalThirdGainPercent: number | null;
  irp: number | null; dimensions: EffortDimensions | null; climbs: EffortClimb[];
  profile: { km: number; altitude: number; segment: number }[]; limitations: string[];
}
export interface ComparedRoute {
  id: number; title: string; metrics: EffortMetrics;
  recorded: { elapsedSeconds: number | null; heartRate: RecordedSamples; power: RecordedSamples; notes: string[] };
}
export interface RecordedSamples { count: number; mean: number | null; maximum: number | null; }
export interface RouteComparison {
  id?: number | null; title?: string | null; createdAt?: string | null;
  routes: ComparedRoute[]; aiStatus: 'generated' | 'unavailable';
  narrative: { summary: string; routeA: string; routeB: string; answers: string[]; verdict: string } | null;
}

export interface SavedRouteComparison {
  id: number; title: string; trackAId: number; trackBId: number;
  createdAt: string; aiStatus: 'generated' | 'unavailable';
}
