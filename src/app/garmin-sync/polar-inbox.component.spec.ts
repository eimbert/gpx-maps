import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { PolarInboxComponent } from './polar-inbox.component';

describe('Polar sync errors', () => {
  const cases = [
    ['POLAR_AUTHORIZATION_REQUIRED', 'reconnectRequired'],
    ['POLAR_ACCESS_DENIED', 'accessDenied'],
    ['POLAR_RATE_LIMITED', 'rateLimited'],
    ['POLAR_UNAVAILABLE', 'temporarilyUnavailable'],
    ['POLAR_REQUEST_REJECTED', 'requestRejected'],
    ['UNKNOWN', 'syncFailed'],
    ['__proto__', 'syncFailed']
  ];
  for (const [code, message] of cases) {
    it(`explains ${code} and clears stale success`, async () => {
      const inbox = { sync: () => throwError(() => new HttpErrorResponse({ status: 502, error: { code } })) };
      const component = new PolarInboxComponent(inbox as any, {} as any, {} as any, {} as any);
      component.message = 'connected';
      await component.sync();
      expect(component.error).toBe(message as any);
      expect(component.message).toBeNull();
      expect(component.busy).toBeFalse();
    });
  }

  it('can retry after an error and refresh the inbox', async () => {
    const inbox = {
      sync: jasmine.createSpy().and.returnValues(
        throwError(() => new HttpErrorResponse({ status: 502, error: {} })),
        of({ imported: 1, alreadyPresent: 0, withoutGps: 0 })),
      connection: () => of({ available: true, connected: true, connectedAt: null }),
      rides: () => of([])
    };
    const component = new PolarInboxComponent(inbox as any, {} as any, {} as any, {} as any);
    await component.sync();
    expect(component.error).toBe('syncFailed');
    await component.sync();
    expect(component.error).toBeNull();
    expect(component.message).toBe('newActivities');
    expect(component.busy).toBeFalse();
  });
});
