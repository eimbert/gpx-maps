export const environment = {
  production: true,
  loginUrl: '/api/auth/login',
  registerUrl: '/api/auth/register',
  resendVerificationUrl: '/api/auth/resend-verification',
  meUrl: '/api/auth/me',
  routesApiBase: '/api/routes',
  tracksApiBase: '/api/tracks',
  mapLibreStyleUrl: 'https://maps.geoapify.com/v1/styles/osm-carto/style.json?apiKey=8aecae69e4a741e3999b70dd20dcc7b7',
  mapLibreTerrainSourceUrl: 'https://demotiles.maplibre.org/terrain-tiles/tiles.json',
  mapLibreTerrainExaggeration: 1.25,
  mapLibreRasterTiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  mapLibreRasterAttribution: '© OpenStreetMap contributors'
};
