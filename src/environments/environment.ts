// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  loginUrl: 'http://localhost:8080/api/auth/login',
  registerUrl: 'http://localhost:8080/api/auth/register',
  resendVerificationUrl: 'http://localhost:8080/api/auth/resend-verification',
  meUrl: 'http://localhost:8080/api/auth/me?authorizationHeader',
  routesApiBase: 'http://localhost:8080/api/routes',
  tracksApiBase: 'http://localhost:8080/api/tracks',
  mapLibreStyleUrl: 'https://maps.geoapify.com/v1/styles/osm-carto/style.json?apiKey=8aecae69e4a741e3999b70dd20dcc7b7',
  mapLibreTerrainSourceUrl: 'https://demotiles.maplibre.org/terrain-tiles/tiles.json',
  mapLibreTerrainExaggeration: 1.25,
  mapLibreRasterTiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  mapLibreRasterAttribution: '© OpenStreetMap contributors'
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
