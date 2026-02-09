// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

const back = "localhost:8081"
export const environment = {
  production: false,
  devBypassAuthGuard: true,
  loginUrl: `http://${back}/api/auth/login`,
  registerUrl: `http://${back}/api/auth/register`,
  resendVerificationUrl: `http://${back}/api/auth/resend-verification`,
  meUrl: `http://${back}/api/tracks/me`,
  routesApiBase: `http://${back}/api/routes`,
  tracksApiBase: `http://${back}/api/tracks`,
  planApiBase: `http://${back}/api/plan-folders`,
  usersApiBase: `http://${back}/api/users`,

  mensajesApiBase: `http://${back}/api/mensajes`
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
