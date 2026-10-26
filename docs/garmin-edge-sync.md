# Sincronización del campo Tracketeo en Garmin Edge MTB

Estado (20/10/2026): la versión 1.2.0 ya está publicada e instalada, pero falla al solicitar el código. El backend público responde correctamente a `/api/garmin/pair/start`; la interfaz pública de vinculación aún no está disponible. La versión 1.2.1 corregida está compilada y pendiente de subir como actualización de la ficha existente e instalarse en el Edge.

## Cómo se vincula

1. Al abrir el perfil de actividad con el campo Tracketeo y con conexión al móvil o Wi-Fi, el Edge solicita un código de diez dígitos a `/api/garmin/pair/start`.
2. El usuario inicia sesión en Tracketeo, abre `/garmin` e introduce el código una sola vez. `/api/garmin/pair/claim` asocia ese Edge a su cuenta.
3. El Edge consulta `/api/garmin/pair/status` y, al quedar vinculado, envía bloques de posiciones a `/api/garmin/chunks` con un token aleatorio propio del dispositivo en la cabecera `X-Tracketeo-Token`.
4. La página `/garmin` muestra las actividades recibidas en una bandeja privada con distancia, desnivel, duración y vista de mapa. «Incorporar» crea un GPX privado en el archivo; «Descartar» borra los puntos de la bandeja. Los siguientes bloques de una actividad ya incorporada actualizan su GPX.

El código caduca a los diez minutos. El backend guarda únicamente el hash SHA-256 del token. Los bloques se identifican por actividad e índice para admitir reintentos sin duplicar puntos.

## Archivos preparados

### Incorporación desde la bandeja (25/10/2026)

Antes de incorporar se propone un nombre editable con fecha y hora local de
inicio. La casilla «Compartir con la comunidad» aparece marcada por defecto;
desmarcarla guarda una ruta privada. Garmin, Polar y Wahoo envían `name` y
`shared` a su endpoint de incorporación. El servidor conserva como privadas
las peticiones antiguas sin `shared`; no cambia la visibilidad de rutas existentes.
Los bloques Garmin posteriores conservan la elección guardada.

Para esta opción se deben desplegar juntos el frontend y el WAR actualizado.
Pruebas: `scripts/test-inbox-import-browser.cjs` y los tests Java de cada proveedor,
con casos de compartir, no compartir y peticiones anteriores sin ese campo.

- Frontend en `src/app/garmin-sync/`, con ruta y enlace en la portada, y política de privacidad actualizada.
- Fuentes Java incorporadas en `C:\PROGRAMACION\Java\PayGoon\src\main\java\com\paygoon` y prueba en `src\test\java\com\paygoon\service\GarminSyncServiceTest.java`.
- Proyecto Connect IQ como **Tracketeo GPX Capture** en `C:\PROGRAMACION\TracketeoConnectIQ`; actualización firmada `bin\tracketeo-gpx-capture-1.2.1.iq` (ID `41805b3f6f894fbf9ed9a0672e78dd9a`). Corrige el fallo `IQ!` al iniciar la petición HTTPS haciendo accesible el callback `method(:onResponse)` y comparando por valor el tipo de respuesta. El ID anterior quedó reservado tras borrar la ficha y su manifiesto se conserva en `store\manifest-deleted-listing.bak`. Compatibilidad compilada: Edge MTB, 540, 550, 840, 850, 1040 y 1050, incluidas las variantes Solar agrupadas por Garmin. El filtro de ciclismo se ha retirado: el campo registra cualquier actividad que proporcione GPS.
- `tmp/garmin-bridge/paygoon-check/` es una copia temporal del backend usada solo para validar compilación y pruebas. No se debe desplegar esa copia.

## Verificación efectuada

- Angular: `npm run build -- --configuration development`, correcto.
- Connect IQ SDK 9.3: exportación 1.2.1 para los ocho dispositivos, correcta; el simulador Edge MTB arranca sin el fallo `IQ!` observado en 1.2.0 y muestra un código de vinculación tras recibir HTTP 200 del backend público.
- Backend real: compilación Maven y cinco pruebas de servicio, correctas.

## Antes de una prueba real

La incorporación al backend añadió tres rutas accesibles sin sesión web: inicio de vinculación, consulta de estado y recepción de bloques. La consulta y la recepción verifican el token del Edge; la vinculación definitiva y todas las acciones de la bandeja exigen sesión de Tracketeo. La prueba en el simulador confirma que el inicio de vinculación responde en el backend público. No se ha cambiado aún el paquete instalado en el Edge ni se ha verificado el resto del flujo real.

Para una prueba real: desplegar el frontend de vinculación, subir el `.iq` 1.2.1 como **actualización de la ficha existente** (mismo App ID), instalar la actualización en el Edge, abrir el perfil con el campo y conexión, introducir el código en `/garmin` y grabar una salida corta. La página debe mostrar la actividad pendiente; tras «Incorporar» debe figurar en el archivo privado. La transmisión depende de la conexión disponible para Connect IQ; los bloques pendientes se reintentan al volver a abrir el campo. La última fracción de una actividad puede esperar al siguiente inicio del campo si este se cierra antes de completar su petición.
