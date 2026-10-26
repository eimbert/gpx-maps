# Solicitud de Suunto Partner Program — Tracketeo Bike

Estado: borrador preparado el 23/10/2026. **No presentado ni firmado.**

Formulario oficial (en inglés): <https://survey.alchemer.eu/s3/90553908/PARTNER-Become-a-Suunto-Partner>

## Datos del solicitante

| Campo | Valor para revisar |
| --- | --- |
| Legal applicant | Enrique Imbert-Bouchard, persona autónoma titular de Tracketeo Bike. «tracketeo.bike» es la marca comercial, no una sociedad. |
| Brand / trading name | Tracketeo.bike |
| Country / city | Spain / Barcelona |
| Contact person and email | Enrique Imbert-Bouchard — `enrique.imbert@tracketeo.bike` |
| Developers needing API Zone access | Enrique Imbert-Bouchard — `enrique.imbert@tracketeo.bike` |
| Product / application | Tracketeo Bike |
| Website | <https://tracketeo.bike/> — verificar que carga antes de enviar |
| Privacy policy | <https://tracketeo.bike/privacy-policy> — verificar que carga antes de enviar |
| Partnership area | Digital integration → **Suunto Cloud API** |

## Texto en inglés para la propuesta

**Short product description**

> Tracketeo Bike is a web application for cyclists to collect and organize GPS routes, plan rides, review route profiles and explore routes in 3D. Users manage their own private route library and choose which incoming device activities to add.

**Applicant and partnership fit**

> Tracketeo Bike is a public-facing cycling service operated by Enrique Imbert-Bouchard, a sole proprietor based in Barcelona, Spain. Our Garmin and Polar Flow integrations are complete and operational. We would like to add Suunto, a leading brand in outdoor sports, to broaden device support. A Suunto integration would let cyclists and outdoor athletes bring their own recorded routes into one place for review and ride planning, while giving Suunto users another useful way to explore their workouts. We are requesting Suunto Cloud API access for this specific service, not for personal API use.

**Why we request Suunto Cloud API access**

> We would like Suunto users to connect their own accounts to Tracketeo Bike through OAuth 2.0. With each user's permission, we would receive their recorded workouts with GPS data, show them in a private inbox, and let the user review and explicitly import selected routes into their Tracketeo library. The first integration would read workouts only. We do not need daily health, sleep, recovery, or profile data for this use case. We would handle new workouts through Suunto's signed webhook notifications and provide account disconnection and data deletion controls.

**Potential later capability, only if asked**

> In a later phase, we may explore sending a user's own planned GPX routes to their Suunto account for watch navigation, subject to the appropriate API access and separate user consent.

## Revisión antes de presentarla

1. Indicar a Enrique Imbert-Bouchard como titular autónomo y a Tracketeo.bike como marca comercial. Usar `enrique.imbert@tracketeo.bike` como contacto y correo de desarrollo. Completar cualquier otro dato fiscal o postal que pida el formulario con los datos reales del titular.
2. Comprobar las URLs públicas y que el responsable de privacidad publicado coincide con el solicitante legal.
3. Seleccionar **Suunto Cloud API** en el formulario. Según Suunto, esa elección presenta el API Agreement y permite indicar qué desarrolladores recibirán acceso.
4. El titular autorizado debe leer y **firmar personalmente** el acuerdo API. El formulario avisa también de la suscripción a Suunto Partner News al enviarlo.
5. Tras la aceptación, suscribirse al Development API, registrar OAuth y probar con una cuenta Suunto real. El acceso de producción es un paso posterior.

## Fuentes oficiales

- Programa y formulario: <https://www.suunto.com/en-us/partners/welcome-partners/>
- Proceso y plazos: <https://apizone.suunto.com/>
- Preguntas frecuentes sobre requisitos, acuerdo y acceso: <https://apizone.suunto.com/faq>
- Inicio técnico OAuth/API: <https://apizone.suunto.com/how-to-start>
- Notificaciones firmadas de entrenamientos: <https://apizone.suunto.com/webhooks>

## Siguiente integración candidata: Wahoo

Para una aplicación centrada en ciclismo, **Wahoo Cloud API** es la siguiente integración. El titular ha recibido por correo la aprobación de **Tracketeo.bike como aplicación Sandbox** (23/10/2026). La solicitud se hizo para conectar cuentas mediante OAuth 2.0 y leer entrenamientos; el entorno de producción requiere otra solicitud y aprobación independientes. No se puede convertir Sandbox en Production. Las credenciales de Wahoo deben mantenerse en la configuración privada del servidor, nunca en Git ni en Angular.

COROS ofrece una API de partner con OAuth, webhooks, FIT y GPX, pero exige una plataforma con base de usuarios demostrable y una empresa registrada; conviene retomarla cuando esos requisitos estén acreditados. Strava requiere un estudio específico de compatibilidad de sus términos con el archivo, la comparación, las rutas compartidas y las funciones de IA de Tracketeo.

- Wahoo Cloud API: <https://developers.wahooligan.com/cloud>
- COROS Partner API: <https://support.coros.com/hc/en-us/articles/53181766856724-Partner-API-Access>
- Strava API Policy: <https://www.strava.com/legal/api_policy>
