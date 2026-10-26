import { PwaInstallService } from './pwa-install.service';

describe('PwaInstallService', () => {
  let service: PwaInstallService;
  let media: MediaQueryList;
  let stored: Map<string, string>;
  let now: number;

  beforeEach(() => {
    now = 1_800_000_000_000;
    spyOn(Date, 'now').and.callFake(() => now);
    spyOnProperty(navigator, 'userAgent', 'get').and.returnValue('Mozilla/5.0 Android');
    spyOnProperty(navigator, 'platform', 'get').and.returnValue('Linux');
    media = Object.assign(new EventTarget(), { matches: false }) as MediaQueryList;
    spyOn(window, 'matchMedia').and.returnValue(media);
    stored = new Map();
    spyOn(Storage.prototype, 'getItem').and.callFake(key => stored.get(key) ?? null);
    spyOn(Storage.prototype, 'setItem').and.callFake((key, value) => { stored.set(key, value); });
  });

  afterEach(() => service?.ngOnDestroy());

  function offer(outcome: 'accepted' | 'dismissed' = 'accepted'): jasmine.Spy {
    const prompt = jasmine.createSpy('prompt').and.returnValue(Promise.resolve());
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt, userChoice: Promise.resolve({ outcome })
    });
    window.dispatchEvent(event);
    return prompt;
  }

  it('waits for Android installation availability and a user action', async () => {
    service = new PwaInstallService();
    expect(service.canOffer).toBeFalse();
    const prompt = offer();
    expect(service.canOffer).toBeTrue();
    expect(prompt).not.toHaveBeenCalled();
    await service.install();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(service.canOffer).toBeFalse();
    await service.install();
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('offers iPhone instructions without a native installation event', () => {
    (Object.getOwnPropertyDescriptor(navigator, 'userAgent')!.get as jasmine.Spy).and.returnValue('Mozilla/5.0 iPhone');
    service = new PwaInstallService();
    expect(service.isIos).toBeTrue();
    expect(service.canOffer).toBeTrue();
  });

  it('does not offer installation on a desktop browser', () => {
    (Object.getOwnPropertyDescriptor(navigator, 'userAgent')!.get as jasmine.Spy).and.returnValue('Mozilla/5.0 Windows NT');
    service = new PwaInstallService();
    offer();
    expect(service.canOffer).toBeFalse();
  });

  it('remembers dismissal for 30 days across page loads', () => {
    service = new PwaInstallService();
    offer();
    service.dismiss();
    service.ngOnDestroy();
    service = new PwaInstallService();
    offer();
    now += 29 * 86400000;
    expect(service.canOffer).toBeFalse();
    now += 86400000;
    expect(service.canOffer).toBeTrue();
  });

  it('snoozes after the native installation dialog is dismissed', async () => {
    service = new PwaInstallService();
    offer('dismissed');
    await service.install();
    offer();
    expect(service.canOffer).toBeFalse();
  });

  it('remembers an installed app when the user later opens the browser', () => {
    Object.assign(media, { matches: true });
    service = new PwaInstallService();
    expect(service.canOffer).toBeFalse();
    service.ngOnDestroy();
    Object.assign(media, { matches: false });
    service = new PwaInstallService();
    offer();
    expect(service.canOffer).toBeFalse();
  });

  it('hides immediately after installation from the browser menu', () => {
    service = new PwaInstallService();
    offer();
    window.dispatchEvent(new Event('appinstalled'));
    expect(service.canOffer).toBeFalse();
    expect(stored.get('tracketeo.install-prompt.v1')).toContain('"installed":true');
  });

  it('still respects choices when storage is blocked', () => {
    (Storage.prototype.getItem as jasmine.Spy).and.throwError('Storage blocked');
    (Storage.prototype.setItem as jasmine.Spy).and.throwError('Storage blocked');
    service = new PwaInstallService();
    offer();
    service.markInstalled();
    expect(service.canOffer).toBeFalse();
  });

  it('shows a manual fallback when opening the native dialog fails', async () => {
    service = new PwaInstallService();
    const prompt = offer();
    prompt.and.callFake(() => Promise.reject(new Error('Unavailable')));
    await service.install();
    expect(service.busy).toBeFalse();
    expect(service.canOffer).toBeTrue();
    expect(service.error).toContain('menú del navegador');
  });
});
