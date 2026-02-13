const back = "tracketeo.bike"
export const environment = {
  production: true,
  devBypassAuthGuard: false,
  loginUrl: `https://${back}/api/auth/login`,
  registerUrl: `https://${back}/api/auth/register`,
  resendVerificationUrl: `https://${back}/api/auth/resend-verification`,
  meUrl: `https://${back}/api/tracks/me`,
  routesApiBase: `https://${back}/api/routes`,
  tracksApiBase: `https://${back}/api/tracks`,
  planApiBase: `https://${back}/api/plan-folders`,
  usersApiBase: `https://${back}/api/users`,

  mensajesApiBase: `https://${back}/api/mensajes`
};