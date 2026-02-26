const apiBase = 'https://tracketeo.bike/api';

export const environment = {
  production: true,
  devBypassAuthGuard: false,

  loginUrl: `${apiBase}/auth/login`,
  registerUrl: `${apiBase}/auth/register`,
  resendVerificationUrl: `${apiBase}/auth/resend-verification`,
  forgotPasswordUrl: `${apiBase}/auth/forgot-password`,
  resetPasswordUrl: `${apiBase}/auth/reset-password`,

  meUrl: `${apiBase}/tracks/me`,
  routesApiBase: `${apiBase}/routes`,
  tracksApiBase: `${apiBase}/tracks`,
  planApiBase: `${apiBase}/plan-folders`,
  usersApiBase: `${apiBase}/users`,
  mensajesApiBase: `${apiBase}/mensajes`,
  geoCode: `${apiBase}/geocode/reverse`,
};
