import { GarminSyncComponent } from './garmin-sync.component';
import { polarRide } from './inbox-ride';

describe('unified inbox location', () => {
  it('shows the Polar location returned when a ride is incorporated', () => {
    const component = new GarminSyncComponent({} as any, {} as any, {} as any, { current: 'es' } as any, {} as any);
    const ride = polarRide({
      id: 7, trackId: 99, name: 'Salida Polar', startTime: '2026-10-22T09:00:00Z',
      pointCount: 2, status: 'INCORPORATED', distanceKm: 7.1, ascentMeters: 80,
      durationSeconds: 1200, province: 'Barcelona', population: 'Santa Coloma de Gramenet'
    });

    expect(component.rideLocation(ride))
      .toBe('Provincia: Barcelona · Población: Santa Coloma de Gramenet');
  });
});
