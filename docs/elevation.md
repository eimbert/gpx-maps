# Desnivel acumulado

**Contrato vigente: v5 adaptativo A/B/C.** Ver [criterios, filtrado y despliegue](elevation-quality.md).
La revisión siguiente documenta el contrato v3 anterior y la investigación que motivó v4.

## Contrato anterior v3

Las tres entradas de GPX (Animar, Planificar y Analizador) utilizan `calculateGpxElevation`. El servidor valida y guarda con `GpxElevationService`, una implementación Java del mismo contrato, comprobada con los mismos GPX y resultados. La vista previa funciona sin llamadas de red y sin consumir análisis de IA.

1. Leer `trkseg` o rutas `rte`, incluidos namespaces. Conservar sus límites. No utilizar los totales de extensiones de fabricantes: a veces son parciales o usan otros filtros.
2. Calcular distancia horizontal Haversine (radio 6 371 000 m). No unir segmentos ni coordenadas inválidas. Una altitud ausente, no numérica o fuera de -500…9000 m interrumpe la altimetría; no se convierte en cero. Cero y altitudes negativas válidas se conservan.
3. Ignorar desplazamientos de menos de 1 m dentro del perfil. Corregir un pico interior aislado si cambia de signo respecto a ambos vecinos, se desvía de su interpolación más de `max(20 m, 0.5 × menor distancia al vecino)` y los vecinos no implican pendiente mayor del 100%.
4. Antes del remuestreo, promediar la altitud por distancia en una ventana de 20 m mediante integración trapezoidal; evita que ruido rápido se convierta en falsas colinas al reducir muestras. Remuestrear cada tramo continuo cada 10 m. Limitar a aproximadamente 200 000 muestras en rutas patológicas. Aplicar mediana de tres muestras y media triangular `[1,2,1]/4`, conservando extremos.
5. Detectar ascensos/descensos por cambio de dirección confirmado de 5 m. Contar todo el tramo desde su valle/cima, incluido el último ascenso/descenso confirmado. No descartar pequeños incrementos sucesivos: una subida suave larga sí suma. Una bajada nunca se transforma en subida mediante `máximo − mínimo`.
6. Sumar segmentos válidos y redondear una sola vez al metro. `ok`: datos completos; `partial`: hay huecos, suma de los tramos disponibles; `unavailable`: sin tramo con altitud suficiente, totales `null`.

La versión identifica el algoritmo, no la precisión del GPS. Un GPX con altitud errónea sostenida puede seguir siendo inexacto. Los filtros reducen ruido y picos, pero también pueden omitir ondulaciones inferiores a 5 m. No se garantiza coincidencia con Garmin, Strava u otros proveedores. No hay corrección automática por terreno exclusiva del Analizador: cambiar la fuente solo allí produciría resultados distintos.

## Revisión de una captura barométrica (25/10/2026)

El archivo facilitado `tracketeo-gpx-capture-1792913008.gpx` contiene 2.543 puntos,
un segmento y altitud en todos los puntos. El cálculo v3 reproduce 893 m D+
en 30,780 km. La suma de todos los incrementos sin filtrar da 1.014,8 m.
El usuario confirma que la altitud procede de su Garmin con altímetro
barométrico y aporta 970 m D+ del dispositivo como referencia para esta
revisión, además de 946 m de IBP Index.

En pruebas aisladas, conservando el resto del algoritmo, reducir la inversión
de 5 a 3 m da 909 m; reducirla a 2 m da 927 m. Quitar solamente la mediana o
la media triangular da 900 m; quitar ambas da 904 m. Una ventana previa de
10 m en lugar de 20 m da 894 m. Estos cambios no se han aplicado: acercar una
única ruta a un total de referencia no demuestra que mejoren el cálculo general.
Se conserva v3 y no se recalculan rutas ni se aplica un factor porcentual.

El campo Connect IQ local captura `Activity.Info.altitude` cada cinco segundos.
El GPX resultante no contiene el total de ascenso del dispositivo ni información
que permita reconstruir todos los datos internos usados por Garmin.

### Contraste con la exportación completa de Garmin Connect (25/10/2026)

El segundo archivo, `activity_24846378801.gpx`, contiene 12.713 puntos en un
segmento, todos con altitud. Comparte las 2.543 marcas de tiempo de la captura;
la diferencia absoluta media entre sus altitudes es 0,418 m (máxima 5,717 m).
Esto respalda que ambas grabaciones contienen esencialmente el mismo perfil
barométrico. La exportación completa dura ocho segundos más.

| Cálculo local | Captura Tracketeo | Exportación Garmin |
| --- | ---: | ---: |
| Puntos | 2.543 | 12.713 |
| Distancia Haversine | 30,780 km | 31,236 km |
| Suma de incrementos sin filtros | 1.014,8 m | 1.029,4 m |
| Algoritmo v3 actual | 893 m | 895 m |
| Experimental: inversión de 1 m, conservando todos los suavizados | 945 m | 950 m |
| Experimental: inversión de 1 m, media de 20 m, sin mediana ni media triangular | 959 m | 966 m |

Frente a la referencia barométrica de 970 m, v3 queda 75 m por debajo incluso
con la exportación completa. El incremento de densidad solo recupera 2 m en
v3: la principal diferencia procede del filtrado, especialmente del umbral
de inversión de 5 m. El último experimento queda a 4 m de la referencia con
el GPX de Garmin y a 11 m con la captura.

Los experimentos se han ejecutado aislados, sin modificar el algoritmo de la
aplicación. El último pasa 20 de las 21 regresiones numéricas existentes;
falla el caso de ondulaciones de ruido de ±1,5 m en una ruta llana de 10 km,
donde suma 46 m D+ en lugar de cero. Por tanto, hay una alternativa más
adecuada para este perfil barométrico confirmado, pero sustituir globalmente
v3 introduciría una regresión para altitudes ruidosas. Para incorporarla hace
falta representar explícitamente la procedencia/calidad barométrica en la
importación y conservarla en frontend y backend. El texto `Garmin Connect`
del creador GPX por sí solo no demuestra el tipo de sensor; este archivo se
considera barométrico por la confirmación del usuario. No se aplica un factor
para forzar 970 m ni se cambian rutas guardadas.

## Verificación

### Colores de pendiente en el mapa 2D

`track-slopes.ts` calcula la pendiente local con el perfil filtrado anterior y una ventana de 50 m de distancia horizontal (mínimo 20 m en recorridos cortos). Solo se resaltan los ascensos: verde >0 % y <5 %, amarillo de 5 % a <10 % y rojo ≥10 %. Los llanos y descensos conservan el color original del track. Son umbrales de visualización de inclinación, no una clasificación de dificultad técnica.

La altitud ausente, inválida o estimada, los saltos entre muestras de más de 100 m y los límites entre segmentos/tracks interrumpen el cálculo. Los tramos sin información suficiente se muestran grises. No se conectan segmentos distintos. El filtrado reduce ruido y picos aislados, pero no corrige un error sostenido del altímetro ni garantiza medir rampas muy cortas con precisión.

La capa SVG y la de MapLibre comparten los mismos colores. La casilla de cada track controla ambas capas y todos sus marcadores. `track-slopes.spec.ts` comprueba rampas, bajadas, densidades distintas, ruido, picos, huecos y límites; `track-visibility.spec.ts` comprueba la visibilidad y la importación de segmentos. `scripts/test-map-slopes-browser.cjs` prueba la vista con tres rutas en escritorio y móvil después de una compilación de desarrollo.

### Desnivel acumulado

`node scripts/test-elevation.cjs .elevation-work/elevation-fixtures.json` comprueba casos con ascenso conocido, descenso puro, densidades distintas, ruido, picos, huecos, segmentos, altitudes negativas y 160 000 puntos. Produce GPX con resultados esperados para comprobar la paridad Java. Los tests de navegador comprueban el parser XML y namespaces. Los tests Java verifican el cálculo, persistencia y el endpoint de altimetría.

Los informes de IA guardados con un criterio anterior no se regeneran ni consumen saldo automáticamente. Se deben identificar como anteriores al cambio; sus estadísticas se recalculan con el criterio actual. El despliegue de frontend y backend debe coordinarse para no guardar resultados con el algoritmo antiguo.

## Comparación de dos rutas en Planificar salida

`POST /route-analysis/comparison` recibe `trackIds` (exactamente dos identificadores distintos de la misma carpeta) y `reportLanguage`. El servidor comprueba acceso a ambos tracks con `RouteAnalysisLinks`; lee los GPX guardados, no métricas enviadas por el navegador. Límite de 12 millones de caracteres por GPX. Comparte los límites de informes existentes; solo una redacción de IA válida consume un informe. Si la IA falla se devuelven los cálculos y `aiStatus: unavailable`, sin presentar un texto local como IA.

`RouteEffortAnalyzer` usa el perfil v3 completo; el perfil reducido a unas 400 muestras es solo para dibujar. Calcula máximas pendientes ascendentes sobre ventanas completas de 100/250/500 m, interpolando el extremo. Nunca cruza segmentos ni huecos altimétricos. Clasifica distancia en subida/bajada con pendiente suavizada a 50 m y umbrales ±1,5 %. Detecta cambios de pendiente ≥4 puntos porcentuales entre ventanas de 50 m. Las ascensiones relevantes requieren ≥60 m y ≥12 m de desnivel, confirmadas con inversión de 8 m; estos umbrales son distintos del filtro de 5 m de desnivel acumulado.

Un repecho requiere longitud ≤600 m y pendiente media ≥4 %. Las subidas ≥1,5 km se etiquetan largas; máxima sostenida a 100 m ≥10 % indica rampa dura. Una diferencia ≥2 puntos entre pendiente media del último y primer tercio indica progresión; un rango de pendientes a 100 m ≥4 puntos indica irregularidad. La separación entre cima y siguiente valle mide distancia potencial de recuperación, no tiempo ni descanso garantizado. Solo se cuentan enlaces dentro del mismo segmento.

### Índice Rompepiernas, versión `irp-1-elevation-3`

Todas las normalizaciones siguientes se limitan a [0,1]. El IRP es diez veces la suma ponderada de:

- 25 % frecuencia de repechos / 0,8 por km.
- 25 % pendiente media de los repechos / 12 %.
- 20 % proporción de enlaces entre subidas con separación ≤300 m.
- 15 % desnivel de repechos / desnivel positivo total.
- 15 % exceso de la fracción de desnivel del último tercio sobre 1/3, dividido por 2/3.

Sin ascensiones relevantes el IRP es cero. Un IRP bajo no implica ruta fácil: una ascensión continua puede exigir mucha resistencia. La escala no está validada fisiológicamente; no mide técnica, terreno ni rendimiento de un ciclista concreto.

Las dimensiones utilizan también normalizaciones [0,1], multiplican por 10 y redondean a una décima:

- Resistencia: 35 % distancia/100 km + 35 % D+/2500 m + 30 % mayor ascensión/1000 m de ganancia.
- Explosividad: 60 % pendiente media de repechos/12 % + 40 % máxima a 100 m/18 %.
- Fatiga: 50 % IRP/10 + 30 % D+/2000 m + 20 % distancia/80 km.
- Regularidad: 1 − 60 % IRP/10 − 40 % variación media de pendiente entre ventanas de 50 m/6 puntos. Mayor valor significa mayor facilidad para mantener ritmo.
- Exigencia final: 60 % D+ del último tercio/700 m + 40 % fracción del D+ en el último tercio.
- Global: 22 % distancia/100 km + 22 % D+/2500 m + 16 % mayor ascensión/1000 m + 18 % máxima a 250 m/18 % + 22 % IRP/10.

Las puntuaciones son estimaciones sobre una escala compartida, no percentiles ni comparaciones con una población. No se fuerzan a 0 y 10 por el mero hecho de comparar dos rutas. La IA puede matizar el índice global a partir del perfil y debe explicar sus factores.

No se asignan puntuaciones si falta altimetría, la cobertura es inferior al 95 %, la ruta no alcanza 100 m o más del 5 % de la distancia procede de enlaces entre puntos separados por más de 100 m. Las métricas de perfiles parciales o demasiado simplificados se muestran como orientativas. Los intervalos de muestreo no garantizan exactitud del altímetro.

### Persistencia, IA y despliegue

Se guardan `plan_tracks.irp_score` (Double nullable) e `irp_version` (varchar 40 nullable). El IRP pertenece a la ruta de la carpeta de planificación, no a su posible copia independiente en el archivo general. `setRouteXml` invalida ambos campos al cambiar el GPX; la actualización del IRP comprueba también que el GPX no haya cambiado durante el cálculo. La lista de tracks incluye los dos campos. La configuración actual `spring.jpa.hibernate.ddl-auto=update` crea las columnas al desplegar; en entornos con esquema administrado se deben crear antes del nuevo WAR.

El nuevo comparador hereda `route-analysis.openai.model`. Se puede separar mediante `route-comparison.openai.model=gpt-5.4-mini` o `gpt-5.6-terra`; `route-comparison.openai.reasoning-effort` vale `low` por defecto. Usa la misma clave y el interruptor `route-analysis.openai.enabled`. El modelo recibe métricas y hasta 40 ascensiones seleccionadas por desnivel, con indicación del número omitido, sin coordenadas ni XML bruto. El navegador muestra todas las ascensiones calculadas. La respuesta usa JSON Schema estricto, ocho respuestas y un veredicto; una respuesta incompleta se trata como IA no disponible.

`GpxRecordedEffort` analiza duración entre marcas de tiempo ordenadas de cada segmento y muestras de pulso/potencia separadamente. Son medias por muestra, no ponderadas por tiempo; no se infieren zonas sin umbrales personales. Ninguno de estos datos modifica IRP ni puntuaciones intrínsecas. No se predice duración si falta tiempo fiable.

### Informes conservados y PDF

Cada comparación, incluida la respuesta de métricas cuando la IA no está disponible, se guarda en `route_comparison_reports` con título «Ruta A vs Ruta B», fecha UTC, idioma, autor, carpeta, las dos rutas y un JSON completo del informe. No se duplican los GPX. Cada nueva generación crea una entrada histórica; reabrirla no vuelve a llamar a la IA ni consume cupo. La ficha de las dos rutas muestra sus informes. `GET /route-analysis/comparison/folder/{folderId}` comprueba propiedad o membresía aceptada y devuelve solo metadatos. `GET /route-analysis/comparison/{reportId}` vuelve a comprobar acceso a ambas rutas antes de devolver el informe completo. Eliminar una ruta o la carpeta elimina sus comparaciones asociadas. Las rutas editadas pueden conservar informes históricos: el título y las cifras reflejan la versión calculada en su fecha.

El frontend compone el PDF de todas las secciones del informe, incluidas las secciones plegadas, y lo descarga con el nombre del par de rutas. En móviles que permiten compartir archivos, los botones Correo y WhatsApp abren el selector nativo con el PDF adjunto. Cuando el navegador no admite adjuntos mediante ese selector, descarga el PDF y abre el borrador de correo o WhatsApp con la indicación de adjuntarlo manualmente; los enlaces de texto por sí solos no adjuntan archivos. No se sube el PDF a un servidor público.

El esquema se actualiza con `ddl-auto=update` en la configuración actual. En instalaciones con esquema administrado se deben crear antes del despliegue `route_comparison_reports` y sus índices, además de las dos columnas IRP descritas arriba. Desplegar juntos el nuevo frontend y el WAR para que las fichas puedan cargar los informes.

Verificación: tests Java `RouteEffortAnalyzerTest`, `GpxRecordedEffortTest`, `RouteComparisonServiceTest`; tests Angular `route-comparison.component.spec.ts`; navegador `scripts/test-route-comparison-browser.cjs` con APIs e informes simulados, a 1440 y 390 px. No se llama a OpenAI durante las pruebas. El despliegue requiere el frontend y `api.war` nuevos.
