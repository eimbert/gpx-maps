# Integración de Polar Flow con Tracketeo

Estado (21/10/2026): la cuenta Polar Flow está creada y verificada, y el cliente **Tracketeo Bike** se ha registrado en AccessLink con solo **Exercise data**. El titular confirma que guardó el ID y el secreto del cliente. El callback, el enlace OAuth y una bandeja de revisión ya están implementados en el código local, pero **aún no se han desplegado ni probado con una actividad real**.

## Alta del cliente

1. Crear una cuenta de Polar Flow bajo titularidad de Tracketeo y verificar su correo. Conviene usar un buzón del dominio `tracketeo.bike` administrado por el proyecto, no una cuenta personal de un usuario final.
2. Acceder a <https://admin.polaraccesslink.com/> con esa cuenta y crear un cliente. La primera pantalla, **Contractual Information**, exige organización/titular, dirección, ciudad, código postal y país; dirección 2 y provincia/estado son opcionales. También pregunta si se integra en nombre de un tercero y pide aceptar el *AccessLink Limited License Agreement*. Estos datos deben corresponder al titular legal real: el nombre de marca «Tracketeo Bike» no demuestra por sí solo cuál es la razón social. El usuario debe revisar y aceptar personalmente el acuerdo.
3. En **Application Information**, el formulario pide nombre de aplicación, correo de contacto comercial, descripción, sitio web (opcional), URL de retorno y tipos de datos. El borrador revisado usa el nombre **Tracketeo Bike**, la web <https://tracketeo.bike/>, la URL de retorno propuesta abajo y únicamente **Exercise data**. La descripción inglesa explica que cada usuario conecta su propia cuenta y revisa los tracks GPS antes de guardarlos. **Daily activity data** y **Physical information data** quedan desactivados. La política de privacidad actual está en <https://tracketeo.bike/privacy-policy>; el formulario no la solicita en esta pantalla.
4. La URL HTTPS de retorno registrada es `https://tracketeo.bike/api/polar/oauth/callback`. El controlador correspondiente está en el backend local. Debe desplegarse antes de autorizar usuarios. La URL usada en OAuth debe coincidir exactamente con la registrada en Polar.
5. Conservar el `client_id` y el `client_secret` solo en el gestor de secretos/configuración del servidor. No incluirlos en Angular, Git, documentación ni capturas.

La [documentación oficial v4](https://www.polar.com/polar-api-v4/) explica el alta y el flujo OAuth. La consola es <https://admin.polaraccesslink.com/>.

## Alcance de la primera versión

La meta inicial es **importar actividades con trazado GPS desde Polar Flow al archivo privado de Tracketeo**, previa revisión del usuario. No hace falta solicitar datos de sueño, salud, perfil o actividad diaria. El permiso mínimo para entrenamientos es `training_sessions:read`. El permiso `routes:read` solo se añadiría si se decide importar también las rutas guardadas en Favoritos de Polar Flow; son un tipo de dato distinto de las actividades grabadas. No anunciar sincronización con Polar hasta probar el flujo completo con una cuenta real.

Flujo previsto:

1. El usuario autenticado en Tracketeo elige «Conectar Polar». El backend crea un `state` aleatorio de un solo uso ligado a su sesión y redirige a `https://auth.polar.com/oauth/authorize` con `client_id`, `response_type=code`, `scope=training_sessions:read`, `redirect_uri` y `state`.
2. Polar devuelve el código al callback. El backend valida `state`, canjea el código en `https://auth.polar.com/oauth/token` usando Basic `client_id:client_secret` y guarda los tokens asociados al usuario de Tracketeo. El token de acceso de v4 dura 12 horas; hay que renovar con `refresh_token` y permitir revocación/desconexión. Nunca pasar tokens de Polar al navegador.
3. El backend consulta `GET /v4/data/training-sessions/list` por intervalos de fechas. Con `features=routes`, Polar limita cada consulta a un día. Las posiciones GPS de una sesión aparecen como `routes.route.wayPoints` (latitud, longitud, altitud y tiempo transcurrido). Convertirlas a GPX conservando el orden y los tiempos; omitir sesiones sin GPS y separar correctamente los tramos multideporte.
4. Mostrar cada recorrido recibido en una bandeja privada, con previsualización e incorporación explícita al archivo. Guardar el identificador de sesión Polar para evitar duplicados. La desconexión elimina los tokens y detiene nuevas lecturas; definir si las rutas ya incorporadas permanecen, de forma clara para el usuario.

La API v4 también expone rutas guardadas de navegación mediante `routes:read`, pero [advierte que no permite cargar rutas de terceros](https://www.polar.com/polar-api-v4/) como Komoot o Strava desde ese endpoint. La API v3 ofrece GPX de ejercicios, aunque [solo expone los subidos tras registrar al usuario y durante 30 días](https://www.polar.com/accesslink-api/). Por ello la primera implementación debe evaluar v4 con una cuenta de prueba y no prometer importación histórica hasta verificarla.

## Implementación local y activación

El backend Java `PayGoon` contiene los controladores y servicios de Polar. La bandeja Angular comparte la pantalla `/garmin` con Garmin; Polar solo se ofrece cuando el backend comunica que está configurado. La conexión pide `training_sessions:read`. La sincronización automática consulta los últimos siete días en intervalos de un día, muestra solo sesiones con trazado GPS y evita importar dos veces el mismo identificador. «Comprobar ahora» permite adelantar la consulta de forma opcional. Incorporar crea una ruta privada; descartar borra los puntos de la bandeja; desconectar borra los tokens y conserva las rutas ya incorporadas.

Para activar el backend se necesitan `client.id`, `client.secret` y `POLAR_TOKEN_KEY`. Esta última debe ser una clave aleatoria de 32 bytes codificada en Base64, estable entre despliegues; si se pierde, los tokens almacenados ya no se podrán descifrar y habrá que conectar las cuentas de nuevo. Puede generarse localmente con PowerShell: `$bytes = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); [Convert]::ToBase64String($bytes)`. Guardarla exclusivamente en la configuración privada del servidor, nunca en Git, en Angular ni en el chat. El usuario ha decidido mantener los valores actuales de `application.properties`; revisar su tratamiento antes de publicar el backend.

Antes de anunciar la función: desplegar backend y frontend juntos, comprobar que el callback público llega a la aplicación, conectar una cuenta de prueba y probar con una actividad GPS y otra sin GPS, así como la renovación del token y la desconexión. El alcance de siete días es una decisión de esta primera versión, no un límite de histórico confirmado de Polar.

## Bandeja común y recepción automática

Las tarjetas de fabricantes siempre muestran Vinculado, Pendiente de vincular o No disponible. Garmin abre sus instrucciones y Polar sus opciones compactas. La bandeja comparte contador, lista ordenada por fecha, mapa y acciones. Cada actividad conserva su origen y usa una clave compuesta para evitar colisiones de identificadores.

PolarAutoSync se ejecuta en el servidor cada cinco minutos, incluso con el navegador cerrado. Revisa las sesiones de los últimos siete días de las cuentas conectadas y guarda las nuevas con GPS pendientes de revisión. Deben haberse sincronizado primero con Polar Flow. La primera comprobación empieza quince segundos después del arranque. Un bloqueo de base de datos por conexión serializa sincronización manual y automática; lastSyncedAt evita repetir una consulta automática reciente. Un error de una cuenta no bloquea las demás; un 429 detiene el lote para respetar el límite global de Polar. Desconectar conserva la bandeja y el archivo y detiene nuevas consultas.

Requiere actualizar WAR y frontend. La columna nullable polar_connections.last_synced_at debe crearse mediante la actualización habitual del esquema. La prueba real con una cuenta Polar sigue pendiente.

## Diagnóstico de errores de sincronización (22/10/2026)

Se ha observado un 502 en `/api/polar/sync` y el aviso automático `Polar synchronization failed ... (ResponseStatusException)`. Esos mensajes no identificaban la causa: el servicio anterior convertía cualquier rechazo HTTP de Polar en un 502 genérico. Tras desplegar el diagnóstico, se observó un 400 al renovar el token (`invalid_grant`) y, después de reconectar, un 400 al consultar `training-sessions`.

El backend ahora registra `Polar request rejected: operation=training-sessions, upstreamStatus=...` (o `operation=token`) sin incluir tokens ni el cuerpo de la respuesta de Polar. La respuesta de sincronización contiene `code`, `operation`, `polarStatus` y un mensaje local. Los fallos de transporte usan `POLAR_UNAVAILABLE` y `polarStatus: null`. Un rechazo 429 devuelve 429 y mantiene la interrupción del lote automático; los demás rechazos conservan el 502 hacia el navegador. La interfaz traduce estos códigos a mensajes de autorización, permisos, límite de consultas, indisponibilidad o rechazo de la petición, y elimina mensajes de éxito anteriores al volver a comprobar.

El log está en `${catalina.base}/logs/tracketeo.log` cuando se ejecuta bajo Tomcat, o `./logs/tracketeo.log` en ejecución local, salvo que se configure `TRACKETEO_LOG_FILE`. Después de desplegar los cambios, pulsar «Comprobar ahora» y consultar `polarStatus`/`operation` en la respuesta o `upstreamStatus` en ese log para continuar el diagnóstico. Estas mejoras de diagnóstico no confirman que la conexión real ya funcione.

### Corrección de fechas y persistencia del token

La descripción genérica «ISO 8601» de la documentación no basta para este endpoint: las [pruebas reales documentadas por el mantenedor de polar-mcp, versión 0.3.9](https://github.com/davidmosiah/polar-mcp/blob/main/CHANGELOG.md) identifican que `training-sessions/list` exige fechas con hora local, sin sufijo de zona. Se cambia `from=2026-10-22&to=2026-10-23` por `from=2026-10-22T00:00:00&to=2026-10-23T00:00:00`. Se mantiene el final exclusivo y el intervalo de un día con `features=routes`. La corrección está pendiente de verificar contra la cuenta real tras desplegar el nuevo WAR.

La renovación del token ahora se confirma en una transacción independiente antes de importar actividades. Antes, un error posterior al renovar podía deshacer el guardado del token nuevo y dejar en base de datos el anterior, que Polar puede haber invalidado al rotarlo. Esto es compatible con la secuencia observada, aunque no demuestra la causa del `invalid_grant` original. La importación vuelve a bloquear y leer la conexión, comprueba de nuevo la desconexión y la sincronización automática reciente, y conserva su propia transacción para no guardar importaciones parciales cuando falla.
