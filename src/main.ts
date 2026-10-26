import 'zone.js';
import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { getVersion, setWorkerUrl } from 'maplibre-gl';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

// Keep the worker outside Angular's optimizer: serializing the optimized inline
// worker loses its outer helper bindings in production (ReferenceError: Pn).
// Angular copies this file verbatim from the same installed MapLibre version.
setWorkerUrl(new URL(`assets/maplibre/maplibre-gl-csp-worker.js?v=${getVersion()}`, document.baseURI).href);

if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));

if (environment.production && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
      .catch(err => console.error('Service worker cleanup failed:', err));

    if ('caches' in window) {
      caches.keys()
        .then(keys => Promise.all(keys.map(key => caches.delete(key))))
        .catch(err => console.error('Application cache cleanup failed:', err));
    }
  });
}
