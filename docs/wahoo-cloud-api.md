# Wahoo Cloud API en Tracketeo

Estado 23/10/2026: implementación local y compilación completadas. La aplicación de Wahoo está aprobada como **Sandbox**, según el correo recibido por el titular. Falta desplegar y probar la autorización y una actividad real; los ensayos automatizados utilizan respuestas simuladas. Garmin y Polar ya están operativos, según confirma el titular.

## Configuración del servidor

Se utilizan las propiedades que ya añadió el titular, sin modificar sus valores:

```properties
wahoo.client.id=${WAHOO_CLIENT_ID}
wahoo.client.secret=${WAHOO_CLIENT_SECRET}
wahoo.callback.url=${WAHOO_CALLBACK_URL}
```

La URL de retorno debe coincidir exactamente con la del portal: `https://tracketeo.bike/api/wahoo/oauth/callback`. Configurar la aplicación como confidencial (Yes) y autorizar los permisos `user_read`, `workouts_read` y `offline_data`. No se solicitan permisos de escritura.

Propiedades opcionales y valores predeterminados:

| Propiedad | Valor / comportamiento |
| --- | --- |
| `wahoo.sandbox` | `true`: la conexión solo se ofrece a administradores de Tracketeo |
| `wahoo.frontend-uri` | `https://tracketeo.bike/garmin` |
| `wahoo.token-key` | Clave AES de 32 bytes en Base64. Si no se define, usa `WAHOO_TOKEN_KEY` y, en su ausencia, `polar.token-key` |
| `wahoo.sync-interval-seconds` | `3600`; mínimo una hora en Sandbox, cinco minutos en Production |
| `wahoo.webhook.token` | Vacío: webhook desactivado |
| `wahoo.fit-hosts` | `cdn.wahooligan.com`; lista de hosts HTTPS exactos, separados por comas |

Mantener estable la clave de cifrado entre despliegues. Nunca llevar secretos a Angular ni al repositorio. Las variables deben existir en el entorno del proceso Java; escribir un placeholder en properties no define su valor.

## Funcionamiento implementado

- OAuth con estado aleatorio de un solo uso y caducidad de diez minutos, asociado al usuario autenticado de Tracketeo.
- Tokens cifrados en el servidor y renovación automática antes de consultar actividades. La renovación se guarda aunque falle la consulta posterior.
- Consulta de los últimos 30 días, paginada y con límite de diez páginas por operación. La tarea del servidor comprueba cada minuto qué cuentas requieren consulta; no depende del navegador abierto. En Sandbox la consulta periódica es cada hora y «Comprobar ahora» permite adelantarla, con un mínimo de 60 segundos entre intentos.
- Un 429 de la API suspende las consultas durante una hora. No se hace una recuperación histórica ilimitada.
- Descarga FIT desde hosts permitidos, sin enviarles el token OAuth. Decodificación con Garmin FIT SDK, conservación de tiempos/altitudes y segmentos, cálculo de métricas con el mismo servicio usado por Tracketeo.
- Actividades sin recorrido GPS no aparecen en la bandeja. Sus identificadores quedan registrados para evitar descargarlas repetidamente.
- Bandeja compartida con Garmin y Polar: mapa, incorporación privada al archivo, descarte y contador de Inicio. Los identificadores de cada proveedor se mantienen separados.
- Incorporación bloqueada por fila para evitar duplicados; aplica los límites de rutas de la cuenta. Descartar borra GPX y puntos y mantiene el identificador de origen.
- Desconectar revoca el permiso en Wahoo, borra las credenciales locales y conserva bandeja y archivo. Un fallo del proveedor se muestra como error y permite reintentar.
- Los cuatro botones incluyen logos locales con texto alternativo; cuatro columnas en escritorio y dos en móvil. Suunto permanece no disponible.

Las tablas nuevas son `wahoo_auth_states`, `wahoo_connections` y `wahoo_rides`. La configuración local actual usa `spring.jpa.hibernate.ddl-auto=update`; el despliegue debe permitir su creación o gestionar una migración equivalente.

## Webhook opcional

La integración funciona con el webhook desactivado en el portal. Para activarlo después del despliegue:

1. Crear un token nuevo y guardarlo tanto en el portal como en `wahoo.webhook.token` del servidor.
2. Registrar `https://tracketeo.bike/api/wahoo/webhook` y habilitar las notificaciones.
3. La notificación valida el token y solicita una consulta autenticada. No importa archivos ni URLs recibidos directamente en el mensaje.

## Despliegue y prueba real pendiente

1. Subir el contenido de `dist/gpx-map-viewer` y el backend `C:/PROGRAMACION/Java/PayGoon/target/api.war`.
2. Verificar las variables Wahoo, la clave de cifrado y la creación de tablas al arrancar.
3. Entrar con una cuenta administradora de Tracketeo, abrir Bandeja → Wahoo → Conectar Wahoo y completar la autorización.
4. Comprobar una actividad GPS reciente sincronizada con Wahoo: verla en la bandeja, abrir su mapa e incorporarla una vez. Probar después el descarte de otra actividad y la desconexión.
5. Si Wahoo devuelve un host de descarga distinto, verificarlo y añadir su nombre exacto a `wahoo.fit-hosts`; no permitir dominios arbitrarios.

Para el acceso de usuarios finales hace falta una aplicación Production independiente. Tras su aprobación, configurar sus credenciales, mantener el callback registrado y establecer `wahoo.sandbox=false`. Las cuentas de prueba deberán reconectarse con las nuevas credenciales.

## Verificación realizada

- Java: 51 pruebas de Wahoo, Polar y elevación, sin fallos. Incluyen OAuth, renovación ante errores, límites de consulta, aislamiento de usuarios, FIT, incorporación privada y prevención de duplicados.
- Navegador Chrome: 1440 y 390 px contra la compilación de producción, con backend simulado. Contadores, logos, callback, sincronización manual, mapa, incorporación, descarte y desconexión comprobados.
- `npm run build`: correcto; aviso de tamaño inicial aproximado de 3,01 MB frente al umbral de aviso de 3 MB, además de avisos CommonJS existentes.
- `mvnw.cmd -DskipTests package`: correcto, después de ejecutar las pruebas. Genera `target/api.war`.

## Fuentes técnicas

- [Referencia oficial Wahoo Cloud API](https://cloud-api.wahooligan.com/): OAuth, permisos, paginación, FIT, límites y webhooks.
- [Portal de desarrolladores Wahoo](https://developers.wahooligan.com/): credenciales y configuración Sandbox/Production.
- [Garmin FIT Java SDK](https://github.com/garmin/fit-java-sdk): lectura del formato FIT.

Las frecuencias, ventana de 30 días y restricción a administradores son decisiones de esta implementación.
