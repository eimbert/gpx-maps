# Descubrir ruta

Desde **Inicio → Animar una ruta**, elige **Descubrir ruta**. Carga un GPX o
elige un track del archivo y pulsa **Configurar animación**. Descubrir ruta admite
un solo GPX: el selector de archivos no permite selección múltiple, el arrastre
de varios se rechaza y, una vez elegido un track, hay que quitarlo para escoger
otro. Si se llega desde una selección múltiple de carrera, se conserva el primer
track y se avisa. También puedes pulsar **Animar** desde el
archivo: el track queda seleccionado antes de elegir el tipo de animación.
La opción **Animar carrera** conserva su reproductor `/map`.

El nuevo reproductor `/discover` incluye 3 segundos de acercamiento, un recorrido
a velocidad uniforme por distancia y 4 segundos de panorámica final. Los tiempos
totales se calculan automáticamente con la longitud del track seleccionado:
60 segundos hasta 10 km y, después, `ceil(7 + distanciaMetros / 10000 * 53)`.
Así, 20 km duran 1 min 53 s; 50 km, 4 min 32 s; y 100 km, 8 min 57 s.
Solo aumenta el tiempo de recorrido; el inicio y el cierre conservan su duración.
No hay un tope que vuelva a acelerar las rutas largas ni un selector de duración.
En **Velocidad de reproducción**, los botones **×1 · Normal** (predeterminado)
y **×2 · Doble velocidad** permiten elegir el ritmo. ×2 reduce a la mitad el
tiempo del recorrido y conserva los 3 segundos de inicio y los 4 de cierre:
`7 + (duracionNormal - 7) / 2`. La duración mostrada se redondea al segundo superior.
La selección se conserva al repetir o recargar; los datos anteriores usan ×1.
El visor recalcula el tiempo al cargar, incluso con datos guardados que incluyan
la antigua duración manual. No requiere tiempos en el GPX ni
reordena puntos por fecha. Pausa/continuación y repetición conservan el recorrido;
al ocultar la pestaña se pausa para evitar saltos al regresar.

La vista usa las imágenes Esri existentes y un DEM Terrarium a escala real (sin exageración).
La línea se dibuja en capas nativas de MapLibre, apoyada sobre el terreno. El
rumbo observa la dirección general de un tramo amplio, mantiene su orientación
ante pequeñas curvas y confirma durante 0,6 segundos los cambios de al menos
20 grados. Los giros se suavizan y se limitan a 18 grados por segundo; los bucles
sin una dirección clara conservan la orientación anterior. La línea sigue todos
los puntos del track. Al repetir se reinicia también el rumbo de la cámara.
La cámara de seguimiento usa una inclinación de 50 grados y un encuadre algo
más abierto para reducir la ocultación del recorrido por las laderas cercanas.
En pantallas estrechas y formato vertical el seguimiento se acerca más (hasta
1,1 niveles adicionales de zoom, con un mínimo adaptado al móvil) y mira hacia
abajo a 46–50 grados. El encuadre inicial y final sigue mostrando toda la ruta.
Los cambios de tamaño durante el recorrido ajustan el zoom de forma gradual.
En la configuración de **Descubrir ruta**, **Cámara 3D** permite elegir **Actual**
(opción predeterminada, conserva el encuadre anterior) o **Más cerca**. Esta última
añade entre 0,75 niveles de zoom en escritorio y 1 en pantallas estrechas,
con un máximo de 16,7. Mantiene la inclinación, el seguimiento suave y las
panorámicas de inicio y final. La elección viaja con los datos de reproducción,
se conserva al repetir o recargar y solo se aplica al reproductor 3D.
La distancia por fotograma depende del tiempo transcurrido, no de la frecuencia
de refresco. Las actualizaciones de geometría se limitan a 20 por segundo.
La altura de la cámara se suaviza también: los cambios de relieve y la llegada
de teselas DEM no reajustan su altura bruscamente. Si un fotograma se retrasa más
de 1/15 de segundo, se descarta el tiempo sobrante en vez de saltar un tramo de
la ruta. En dispositivos saturados el vídeo puede durar algo más que la duración
indicada. La pausa, repetición y panorámicas mantienen este comportamiento.

Durante el recorrido aparece un rótulo **Cerca de [población]** al aproximarse
a un núcleo urbano. Usa ciudades, pueblos y aldeas de Geoapify (datos de
OpenStreetMap), consultados a través del backend con sesión de usuario. El umbral
es 450 m para aldeas, 700 m para pueblos pequeños, 1 km para pueblos y 1,2 km para
ciudades. Son distancias al punto representativo del núcleo, no límites urbanos.
Se mantiene un margen al alejarse/cambiar de población para evitar parpadeos.

La consulta se hace una vez al abrir el visor, nunca por fotograma. Las respuestas
se reutilizan en caché. La carga y los fallos son silenciosos, sin mensajes ni
reintentos visibles. Si faltan la sesión, la clave o el servicio, la animación
continúa sin nombres. Se ha eliminado la dependencia de Overpass.

Ver [configuración de Geoapify y avisos de cuota](geoapify.md) para activar la clave
en PayGoon y el correo a soporte@tracketeo.bike. Requiere desplegar ambos proyectos.

Fuentes y atribución:

- [Terrain Tiles, AWS Open Data](https://registry.opendata.aws/terrain-tiles/).
- [Atribución de los datos de relieve](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
- [Fuentes raster-dem de MapLibre](https://maplibre.org/maplibre-style-spec/sources/#raster-dem).
- [Consulta de poblaciones, Geoapify](https://apidocs.geoapify.com/docs/places/).

La elevación se solicita a `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`,
con zoom máximo 15, sin clave. Si falla, se avisa y se continúa con la vista
satélite inclinada. Las imágenes y el relieve necesitan conexión a Internet.

La grabación usa el servicio existente de captura de pestaña y descarga WebM.
Se solicita al pulsar **Descubrir ruta**, para mantener el gesto de usuario que
exige el navegador. La pausa detiene también el grabador; salir libera la captura,
el audio, el mapa y los callbacks. Si se cancela el permiso, continúa la animación.
En móviles se puede reproducir y elegir formato vertical; la grabación sigue
teniendo la misma disponibilidad de escritorio que la animación carrera.

Verificación:

```text
node scripts/test-discovery.cjs
node scripts/test-discovery-places.cjs
node node_modules/@angular/cli/bin/ng.js build --configuration production
node scripts/test-discovery-production.cjs
```

La prueba opcional `scripts/test-discovery-browser.cjs` necesita Playwright,
Chrome y un servidor de desarrollo. `DISCOVERY_TEST_URL` permite cambiar la URL
(por defecto `http://127.0.0.1:4201`) y `DISCOVERY_TEST_OUTPUT` el directorio de
capturas. Usa un contexto de navegador aislado y el GPX incluido en el proyecto.

La prueba de producción sirve directamente `dist/gpx-map-viewer` en un puerto
local temporal y ejecuta el mismo flujo de navegador sobre el código optimizado.
Comprueba también que el worker independiente se ha copiado sin modificaciones
y que un fallo al descargarlo muestra un error recuperable con **Reintentar**.

## Worker de MapLibre en producción

`src/main.ts` configura `setWorkerUrl` antes de crear cualquier mapa. Angular
copia `maplibre-gl-csp-worker.js` desde la misma instalación de MapLibre a
`assets/maplibre`, sin pasarlo por el optimizador. El worker embebido se serializa
desde funciones del bundle y la optimización de Angular 14 puede dejar referencias
a variables externas (`Pn is not defined`), impidiendo completar la carga.

Hay que desplegar **todo** el directorio de compilación, incluido
`assets/maplibre/maplibre-gl-csp-worker.js`. Se sirve como JavaScript desde el
mismo origen. La URL incluye la versión instalada para evitar reutilizar un
worker antiguo al actualizar MapLibre. La configuración respeta el `base href`.
Si la carga no termina en 25 segundos, el reproductor muestra un error con
reintento en lugar de dejar el mensaje «Preparando el paisaje…» indefinidamente.
El reintento recarga el visor conservando el GPX, para sustituir también los workers
fallidos que MapLibre retiene en su dispatcher global.

Después de publicar, comprobar el archivo en el servidor real:

```text
node scripts/check-map-worker.cjs https://www.tracketeo.bike/
```

El comando rechaza tanto un 404 como un `200 text/html` que en realidad contiene
`index.html`, y verifica que el JavaScript publicado coincide con la versión
instalada. Un `Unexpected token '<'` en la URL del worker indica que esa URL
está sirviendo HTML. No se soluciona recargando mientras el archivo siga ausente
o la configuración del servidor lo redirija al documento principal.
