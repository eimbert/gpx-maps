import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AnimationAccessService } from './animation-access.service';
import { AuthService } from './auth.service';

describe('AnimationAccessService', () => {
  const userId = 987654321;
  let session: { id: number; verified: boolean } | null;
  let service: AnimationAccessService;
  let auth: jasmine.SpyObj<AuthService>;
  let http: jasmine.SpyObj<HttpClient>;

  beforeEach(() => {
    session = { id: userId, verified: true };
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['getSession', 'isAuthenticated']);
    auth.getSession.and.callFake(() => session as ReturnType<AuthService['getSession']>);
    auth.isAuthenticated.and.returnValue(true);
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get', 'post']);
    service = new AnimationAccessService(auth, http);
    spyOn(Date, 'now').and.returnValue(1_800_000_000_000);
  });

  it('allows only a preview to a guest or unverified account', async () => {
    session = null;
    expect(await service.claimFullPlayback()).toEqual({ kind: 'guest' });
    session = { id: userId, verified: false };
    expect(await service.claimFullPlayback()).toEqual({ kind: 'guest' });
    expect(http.post).not.toHaveBeenCalled();
  });

  it('shows the server cooldown before a new animation and trusts the claim at halfway', async () => {
    const next = new Date(1_800_000_000_000 + 15 * 86400000).toISOString();
    http.get.and.returnValue(of({ allowed: false, nextAvailableAt: next, daysRemaining: 15, plan: 'FREE' }));
    http.post.and.returnValue(of({ allowed: false, nextAvailableAt: next, daysRemaining: 15, plan: 'FREE' }));
    await service.refreshAvailability();
    expect(service.getKnownCooldown()).toEqual({ kind: 'cooldown', daysRemaining: 15 });
    expect(await service.claimFullPlayback()).toEqual({ kind: 'cooldown', daysRemaining: 15 });
    (Date.now as jasmine.Spy).and.returnValue(1_800_000_000_000 + 14 * 86400000);
    expect(service.getKnownCooldown()).toEqual({ kind: 'cooldown', daysRemaining: 1 });
    (Date.now as jasmine.Spy).and.returnValue(1_800_000_000_000 + 15 * 86400000);
    expect(service.getKnownCooldown()).toBeNull();
  });

  it('does not limit premium accounts', async () => {
    http.post.and.returnValue(of({ allowed: true, nextAvailableAt: null, daysRemaining: 0, plan: 'PREMIUM' }));
    expect(await service.claimFullPlayback()).toBeNull();
    expect(await service.claimFullPlayback()).toBeNull();
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it('does not grant full playback when the server is unavailable', async () => {
    http.post.and.returnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    expect(await service.claimFullPlayback()).toEqual({ kind: 'error' });
  });
});
