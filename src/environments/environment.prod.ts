const apiBase = 'https://tracketeo.bike/api';

export const environment = {
  production: true,
  devBypassAuthGuard: false,

  loginUrl: `${apiBase}/auth/login`,
  registerUrl: `${apiBase}/auth/register`,
  resendVerificationUrl: `${apiBase}/auth/resend-verification`,
  forgotPasswordUrl: `${apiBase}/auth/forgot-password`,
  resetPasswordUrl: `${apiBase}/auth/reset-password`,

  meUrl: `${apiBase}/auth/me`,
  routesApiBase: `${apiBase}/routes`,
  tracksApiBase: `${apiBase}/tracks`,
  planApiBase: `${apiBase}/plan-folders`,
  usersApiBase: `${apiBase}/users`,
  mensajesApiBase: `${apiBase}/mensajes`,
  geoCode: `${apiBase}/geocode/reverse`,
  routePlacesUrl: `${apiBase}/geocode/route-places`,
  routingApiBase: `${apiBase}/routing`,
  routeAnalysisApiBase: `${apiBase}/route-analysis`,
  accountApiBase: `${apiBase}/account`,
  assistantApiBase: `${apiBase}/assistant`,
  billingApiBase: `${apiBase}/billing`,
};
