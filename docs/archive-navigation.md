# Archivo, navegación y proximidad

El archivo conserva en memoria, por cuenta y durante la sesión de la aplicación, la pestaña, agrupación, filtro, grupo abierto, posición de desplazamiento y punto de referencia de proximidad. Se vuelve a consultar el archivo al regresar, para reflejar cambios en las rutas. Los GPX no se persisten en almacenamiento del navegador por esta funcionalidad.

Ver ruta, Analizar y las dos animaciones llevan un destino de regreso interno. El analizador también conserva la salida de planificación que lo abrió. Atrás en la preparación de una animación iniciada desde el archivo vuelve a su lista; en un grupo del archivo vuelve a los destinos.

La proximidad permite ubicación actual, población o coordenadas decimales `latitud, longitud`. La búsqueda de poblaciones usa Nominatim mediante una consulta explícita al pulsar Buscar, sin autocompletado, y permite elegir entre hasta cinco resultados. Se conserva el cálculo existente: distancia al inicio del track y refinamiento de las diez candidatas más próximas por tiempo de conducción cuando responde el servicio de matriz. Cancelar o denegar ubicación no cambia la agrupación.

Referencias para las instrucciones de coordenadas: [ordenador](https://support.google.com/maps/answer/18539?hl=es), [Android](https://support.google.com/maps/answer/18539?hl=es&co=GENIE.Platform%3DAndroid), [iPhone/iPad](https://support.google.com/maps/answer/18539?hl=es&co=GENIE.Platform%3DiOS). API: [Nominatim Search](https://nominatim.org/release-docs/latest/api/Search/).

La guía de Globi está en `assistant-help.ts`, disponible también como ayuda desplegable. El cliente incluye esa misma guía en el historial enviado al asistente para que pueda responder sobre las nuevas funciones.

## Comprobaciones

Pruebas automatizadas: `npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/load-gpx/archive-navigation.spec.ts --include=src/app/utils/elevation-integration.spec.ts`.

Revisión manual con backend y sesión:

- Abrir una población o provincia, desplazarse y ver/analizar/animar una ruta. Atrás debe conservar grupo, filtro y posición.
- Elegir una ruta desde el archivo de animación, volver atrás y repetir con Descubrir ruta y Animar carrera.
- Ordenar desde coordenadas, abrir una ruta y regresar; comprobar la referencia y el orden.
- Buscar una población con varios resultados y seleccionar el deseado; probar cancelar y ubicación denegada.
- Revisar el diálogo de subida y las pantallas Planificar/Analizar en móvil y ordenador.
