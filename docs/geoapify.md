# Poblaciones con Geoapify

El visor consulta `POST /geocode/route-places` del backend PayGoon con la sesión
del usuario. La clave de Geoapify nunca se envía al navegador. No hay avisos de
carga, error ni reintento en la animación. Los invitados continúan viendo la
animación sin esta consulta; el endpoint conserva la autenticación existente.

## Activación

1. Crear una cuenta en https://myprojects.geoapify.com/, un proyecto y su API key.
2. Configurar `GEOAPIFY_API_KEY` en el entorno del proceso que ejecuta PayGoon
   (Tomcat o servicio Java), y reiniciarlo. No incluirla en Angular ni en Git.
3. Desplegar backend y frontend juntos. Sin clave, el backend devuelve 503 sin
   llamar al proveedor; la animación sigue funcionando sin nombres.
4. Mantener configurado el SMTP que ya usa Tracketeo y `app.mail.from`.
   Verificar que el proveedor de correo admite enviar a soporte@tracketeo.bike.
5. La tabla `geoapify_quota_alerts` se crea mediante la configuración actual
   `spring.jpa.hibernate.ddl-auto=update`. Si en producción se gestionan las
   migraciones manualmente, crear antes esta tabla MySQL:

```sql
CREATE TABLE IF NOT EXISTS geoapify_quota_alerts (
    day DATE NOT NULL PRIMARY KEY,
    sent BIT NOT NULL DEFAULT 0,
    retry_after DATETIME(6) NULL
);
```

## Consulta y consumo

Se envía una polilínea reducida a un máximo de 161 posiciones `[lon, lat]`, sin
nombre del GPX, tiempos ni información del usuario. El servidor fija categorías
`populated_place.city/town/village/hamlet`, un corredor entre 1,2 y 3 km y un máximo
de 500 resultados. La API no garantiza un inventario exhaustivo; una ruta muy
densa puede alcanzar ese límite. Se mantienen los radios de aparición anteriores.

Las ocho últimas respuestas del navegador se reutilizan en memoria. El servidor
guarda hasta 128 respuestas durante 24 horas, también en memoria, y limita las
llamadas a una cada 300 ms como máximo y una simultánea por instancia. Las peticiones
que encuentran ocupado el servicio fallan silenciosamente; no forman una cola.
Reiniciar el backend vacía esta caché, pero no el registro de correos enviados.
Estos límites son por instancia; antes de escalar a varios servidores se debe
centralizar también la caché y el límite de llamadas.

El coste depende del número de resultados: no se debe asumir que una ruta consume
un único crédito. Consultar el consumo real del proyecto en el panel de Geoapify.
La atribución «Powered by Geoapify» y OpenStreetMap aparece en el mapa.

## Avisos de cuota

El backend detecta mensajes explícitos de cuota/créditos agotados en respuestas
402, 403 o 429. Un 429 por velocidad, un 401 por clave incorrecta o un fallo de red
no se presentan como créditos agotados ni disparan ese correo.

El aviso se envía a **soporte@tracketeo.bike**, como máximo una vez por día de
Europe/Madrid, con fecha, código HTTP y enlace al panel para revisar consumo.
No contiene claves, rutas ni un saldo inventado. Una fila bloqueada en base de
datos deduplica los avisos entre reinicios e instancias. Si SMTP falla, se guarda
un plazo de 15 minutos antes de permitir otro intento en un fallo de cuota posterior.
No hay un envío programado independiente: se dispara al observar el error real.

Al agotarse la cuota se dejan de hacer nuevas consultas durante una hora por
instancia, manteniendo disponibles los aciertos de caché. Un límite temporal 429
respeta un `Retry-After` numérico (hasta 24 h), con un mínimo de 60 segundos.

## Verificación

- `node scripts/test-discovery.cjs`
- `node scripts/test-discovery-places.cjs`
- Compilación Angular de producción.
- Backend: `mvn -Dtest=GeoapifyRoutePlacesServiceTest,GeoapifyQuotaAlertServiceTest test`
  (HTTP, SMTP y repositorio simulados; sin consumo ni correos reales).

La validación con una cuenta real y la recepción del correo necesitan la clave,
SMTP y base de datos del entorno desplegado. No se ha agotado una cuota real para
probarla.

Referencias: [Places API](https://apidocs.geoapify.com/docs/places/),
[distinción entre cuota y límite temporal](https://apidocs.geoapify.com/how-to/place-discovery/retrieve-places-large-area),
[precios](https://www.geoapify.com/pricing/).
