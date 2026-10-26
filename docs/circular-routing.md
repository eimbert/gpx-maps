# Rutas circulares y animación desde Planificar

## Uso

Cada track de una salida ofrece **Ver mapa** y **Animar en 3D**, en escritorio y móvil.
La animación abre Descubrir ruta, admite GPX sin tiempos y conserva el retorno a la
carpeta de planificación. Usa los controles de acceso del reproductor existente.

**Generar ruta circular** utiliza el diálogo oscuro y los controles del resto de la
aplicación. Valida una distancia entre 5 y 200 km antes de abrir el mapa. Se elige
un inicio y se pulsa **Generar propuesta**. El mapa muestra la geometría, distancia
real, ascenso, porcentaje de carreteras y pistas/vías ciclistas, y avisos. **Buscar
otra propuesta** varía las orientaciones de búsqueda. **Guardar en salida** es la única acción que
persiste el GPX; si falla, la propuesta sigue disponible. Cancelar descarta la propuesta.

## Problemas encontrados

- El frontal sustituía gravel/carretera por `cycling-mountain` al elegir caminos,
  y cualquier perfil por `cycling-regular` en equilibrado.
- `trails` generaba una sola alternativa. Solo `avoid-asphalt` comparaba ocho.
- La valoración confundía índices de puntos de `extras.*.values` con metros.
  Densificar una curva podía cambiar la proporción calculada de terreno.
- No se comprobaba dificultad MTB, firme problemático, cierre del circuito,
  distancia pedida ni solapamiento. Los datos ausentes podían parecer favorables.
- `green` y `quiet` no son preferencias de terreno para ciclismo según la
  documentación actual; `steepness_difficulty` es preferencia de pendiente,
  no dificultad técnica. El frontal enviaba `points` y `seedAttempts` que el DTO
  Java no utiliza. Los avisos del resultado no se mostraban y se guardaba directamente.

## Motor actual: BRouter

PayGoon utiliza ahora BRouter 1.7.10 para las circulares, con perfiles
propios derivados de MTB, gravel y carretera. Las restricciones de dificultad y
acceso se aplican durante el cálculo y después se vuelve a comprobar la geometría.
Se buscan hasta diez alternativas con distintas orientaciones y ajuste de radio,
dentro de 45 segundos. La preferencia por caminos penaliza carreteras desde la
búsqueda; no se trata solo de rechazar las rutas que devuelve ORS.

Instalación, cobertura y empaquetado para Tomcat están documentados en
`C:\PROGRAMACION\Java\PayGoon\routing\brouter\README.md`.
En el alojamiento con panel Tomcat, BRouter corre dentro del WAR. El empaquetado
normal con `package-panel.ps1` deja fuera la tesela de ~120 MB: el servidor la
descarga por HTTPS al arrancar y avisa mientras se prepara. Tomcat necesita espacio
para ese mapa aunque el archivo subido sea pequeño; si no hay espacio total, se
necesita un servicio de rutas externo o más almacenamiento. Instalar BRouter en un
ordenador local no lo activa en `tracketeo.bike`. La propiedad `routing.round-trip.provider=ors`
permite volver al motor anterior. No se usa una demo pública ni se cambia de motor
silenciosamente.

Caso real de las capturas: 41.47306, 2.243099, MTB suave, caminos y 35 km.
Una búsqueda integrada produjo 36,59 km, 67% pistas/vías ciclistas, 23,4% carretera,
1,8% repetido y 417 m de ascenso filtrado de BRouter, en unos 7 segundos. Los
senderos sin dificultad conocida (2,1%) y el firme sin datos (30,3%) se avisan.
Las propuestas varían entre búsquedas. No hay verificación presencial del terreno.

El frontal diferencia falta de cobertura, motor no disponible y ausencia de
candidata adecuada. El marcador de inicio utiliza imágenes locales de Leaflet.
«Suave» limita dificultad técnica conocida, no el desnivel acumulado.

## Proveedor ORS opcional

Al seleccionar explícitamente ORS se mantiene este algoritmo de comparación.
Se conserva la bicicleta elegida; carretera utiliza equilibrado.
Gravel/trekking utiliza `cycling-regular`, que no es un perfil específico de gravel.

Se comparan hasta 3 candidatos en equilibrado, 6 en caminos y 8 en menos pavimento,
con semillas distintas por petición. Cada alternativa solicita superficie, tipo de
vía, dificultad MTB e idoneidad. Se usa la geometría para medir cada segmento;
las etiquetas ausentes, desconocidas o malformadas se mantienen como desconocidas.
Se admite `waytype` y la variante de respuesta `waytypes`.

Primero se descartan candidatos con:

- Coordenadas inválidas, salida a más de 500 m del punto pedido, cierre a más de
  100 m, distancia que difiera más del 40% de la solicitada o más del 65% de aristas repetidas.
- Escaleras, vías en construcción, arena o hielo/nieve conocidos.
- Restricciones de acceso incompatibles cuando las devuelve el motor.
- Dificultad MTB conocida superior a la elegida: MTB suave S0, moderada S1,
  exigente S2; gravel/trekking, eléctrica y carretera se limitan a S0.
  En ORS `traildifficulty=1` significa S0; `0` significa **sin etiqueta**.

Después se puntúan las alternativas válidas. Se penaliza la baja idoneidad, firme
problemático, vías peatonales, senderos sin dificultad conocida, datos ausentes,
carreteras, repetición y desviación de distancia. Se favorecen pistas y vías
ciclistas. Menos pavimento añade una penalización al firme pavimentado sin eliminar
las penalizaciones por ciclabilidad. Una vía ciclista asfaltada puede ser preferible
a una carretera de tierra o a un sendero complicado. Las ponderaciones y umbrales
son una política del producto, no una clasificación oficial de seguridad.

Se excluyen escaleras, vados y ferris en todas las consultas. No hay reintentos que
eliminen esas exclusiones. Si todos los candidatos fallan los filtros se devuelve
`NO_SUITABLE_ROUND_TRIP`, sin una ruta de compromiso. Los errores de autenticación,
cuota, configuración y parámetros no repiten toda la búsqueda. El cliente ORS
limita cada intento a 8 segundos y a un reintento; la búsqueda deja de iniciar
intentos después de 45 segundos (la llamada en curso puede añadir hasta 16 s).
El frontal limita la espera a 70 segundos.

El resultado incluye trazabilidad de intentos, candidatos rechazados, metros y
porcentajes. Advierte sobre falta de datos, senderos desconocidos, distancia con
desviación superior al 15%, repetición, carretera abundante y búsqueda incompleta.
Se conservan también los avisos del proveedor. Los porcentajes de pista/vía ciclista
y carretera no suman necesariamente 100%: existen calles, senderos y otras vías.

## Límites y siguiente mejora

`surface`, `waytype` y `mtb:scale` ayudan a filtrar; no prueban el estado actual,
el mantenimiento, la apertura o la legalidad de todos los tramos. ORS aplica las
restricciones de acceso de su grafo; no se realiza una segunda auditoría de permisos
en OSM. La cobertura de etiquetas es desigual. La detección de repetición reconoce
aristas coincidentes, no todos los caminos paralelos o tramos con distinto muestreo.

El siguiente paso para aumentar la confianza sería incorporar, en el servidor y
con caché, `smoothness`, `tracktype`, `bicycle`, `access` y `mtb:scale:uphill` de los
tramos exactos, además de rutas ciclistas señalizadas. Un mapa de calor o tracks
verificados podrían servir como evidencia adicional de uso, siempre mediante una
fuente con permiso/API; popularidad tampoco garantiza ciclabilidad o acceso.
No se ha añadido scraping de Wikiloc/Strava ni se presentan los caminos como verificados.

## Verificación del 15 de octubre de 2026

- Compilación Angular de producción y TypeScript.
- 15 pruebas Java, con toda la aplicación Java compilada en una copia temporal:
  medición por metros, datos ausentes, plural `waytypes`, geometría, límites técnicos,
  obstáculos/acceso, prioridad de vías ciclistas, perfiles, cuotas, avisos y número
  acotado de intentos. Sin base de datos.
- `scripts/test-plan-roundtrip-browser.cjs`: producción a 390 y 1440 px con APIs
  simuladas; botón 3D y retorno, validación, bicicleta, generación explícita, vista
  previa sin guardado automático, reintento de guardado y ausencia de ruta adecuada.
- Consulta real de humo en Sant Celoni: petición MTB suave de 15 km, seis intentos,
  cinco respuestas y tres candidatos rechazados. Propuesta elegida de 17,526 km,
  61,7% pistas/vías ciclistas y 23,2% carreteras. Firme desconocido en 64,7% y senderos
  sin dificultad conocida en 9,5%; ambos avisados. No se guardó ninguna ruta.
  Es una comprobación del contrato y de un caso real, no una validación sobre el terreno
  ni una comparación estadística con el algoritmo anterior.

Para las pruebas de navegador se necesita Playwright (admite `NODE_PATH`) y Chrome:

```text
node node_modules/@angular/cli/bin/ng.js build --configuration production
node scripts/test-plan-roundtrip-browser.cjs
```

En PayGoon:

```text
mvnw.cmd -Dtest=RoundTripRoutingServiceTest,RoundTripQualityTest test
```

Hay que compilar/desplegar tanto frontal como backend para activar el conjunto de
mejoras. Esta tarea modifica el código local, no despliega el servidor de producción.

## Fuentes oficiales consultadas

- [Opciones de rutas ORS](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options)
- [Información extra y disponibilidad por perfil](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info/)
- [Tipos de vía](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info/waytype)
- [Superficies](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info/surface)
- [Dificultad de senderos](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info/trail-difficulty)
- [Restricciones de acceso](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info/road-access-restrictions)
