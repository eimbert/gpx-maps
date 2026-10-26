# Altitud adaptativa A/B/C — versión 5

La calidad se estima antes de filtrar los puntos originales. No se deduce del
fabricante, nombre del archivo o total declarado. Es una heurística propia de
calidad de señal, no una certificación del sensor ni una escala de IBP Index.
No se sustituye la altitud por la de un modelo de terreno.

## Indicadores y decisiones

Tras separar segmentos, huecos y coordenadas inválidas, se omiten desplazamientos
inferiores a 1 m y se calculan:

- Cobertura: porcentaje de puntos originales con coordenadas y altitud válidas.
- Irregularidad: percentil 90 del residual entre la altitud de cada punto y la
  interpolación de sus dos vecinos por distancia (vecinos a ≤100 m).
- Variación conservada: ascensos más descensos confirmados con inversión de 5 m,
  divididos por toda la variación vertical original. Sin variación, vale 1.
  Evita clasificar como A una ruta llana con pequeñas oscilaciones suaves.
- Densidad: percentil 90 de distancia entre puntos conservados.
- Picos: residual superior a max(20 m, 0,5 × menor distancia al vecino).
- Irregularidad espacial: P90 del residual respecto a la media de las alturas
  interpoladas 50 m antes y después. Se evalúa cada 10 m, sin cruzar segmentos
  ni interpolar huecos de más de 100 m; límite de 200.000 muestras por segmento.
  Detecta oscilaciones suaves que el residual entre puntos contiguos oculta.

| Grado | Criterio | Filtrado |
| --- | --- | --- |
| A | Sin huecos, ≥20 puntos, ≥18 ternas evaluables, ≥100 m; irregularidad ≤1 m; separación P90 ≤30 m; variación conservada ≥80 %; sin picos | Promedio espacial de 20 m, remuestreo cada 10 m, inversión de 1 m; sin mediana ni media triangular |
| B | Casos restantes, incluidos los de muestras escasas | Filtro v3: promedio de 20 m, remuestreo 10 m, mediana y media triangular, inversión 5 m |
| C | Cobertura <95 %, irregularidad >3 m con ≥20 ternas, o más del 1 % de ternas con picos | Promedio de 40 m, remuestreo 10 m, mediana y media triangular, inversión 8 m |

También se asigna C cuando hay al menos 100 evaluaciones espaciales, irregularidad
espacial >3 m, variación conservada <85 % y separación P90 ≤30 m. En este caso
el promedio abarca 200 m y la inversión es 3 × irregularidad espacial, acotada
entre 8 y 20 m. Los dos indicadores se exigen juntos: una curva pronunciada o
una sucesión de colinas reales por sí solas no justifican este filtrado.
El resto de categorías y los C por huecos/picos conservan sus filtros anteriores.

Se comprueba C primero; A requiere todos sus criterios. Todos conservan la
eliminación de picos aislados inverosímiles. Los perfiles sin altitud suficiente
devuelven grado null y desnivel null. Los huecos no se rellenan y la altimetría
parcial sigue marcada como tal. B/C también pueden significar datos insuficientes.

Un error absoluto constante o una deriva suave pueden pasar inadvertidos. La
letra no garantiza precisión y puede variar al simplificar el GPX. Son reglas
iniciales comprobadas con casos sintéticos y tres grabaciones de dos salidas;
necesitan más recorridos independientes para una validación general.

## Resultado de los archivos aportados

La exportación Garmin (12.713 puntos) y la captura Tracketeo (2.543) se clasifican
A sin reglas específicas para ellas. Dan 966 y 959 m D+, respectivamente,
frente a los 970 m del dispositivo indicados por el usuario. No se aplica un
multiplicador para forzar ese valor. Java y TypeScript se contrastan con ambos XML.

Navàs (7.092 puntos, 44,341 km) daba A / 1.409 m en v4. Su residual local es
solo 0,262 m, pero el espacial es 3,320 m y conserva el 80,61 % de la variación:
v5 lo clasifica C y calcula 850 m D+, frente a unos 840 m de referencia indicados
por el usuario. No se identifica por nombre, fabricante ni un total objetivo.
Es una nueva calibración heurística, no una validación universal: el filtrado
intenso puede omitir pequeñas colinas reales y no corrige derivas prolongadas.

## Persistencia y despliegue

- Algoritmo 5; IRP `irp-1-elevation-5`; informes nuevos `v6-elevation5`.
- Campos nullable `elevation_quality`, varchar(1), en `tracks` y `plan_tracks`.
  El JPA configurado con ddl-auto=update añade las columnas. Las instalaciones
  con esquema administrado deben añadirlas antes del WAR.
- El servidor calcula grado y desnivel. Las actividades de dispositivos se
  recalculan al incorporarse aunque su resumen fuera de una versión anterior.
- Las rutas antiguas de archivo/planificación se recalculan al consultarlas.
  Se actualiza la dificultad del archivo y se invalida el IRP antiguo del plan.
- En las fichas del archivo, la letra aparece debajo de las métricas con una
  explicación breve. También se muestra en planificación, analizador, editor y
  descubrimiento 3D; en Inicio se omite para mantener el resumen despejado.
  Los controles interactivos abren la explicación también en móvil. Sin
  clasificación disponible no se inventa una letra.
- Descubrimiento 3D recibe el GPX original para sus estadísticas; la preparación
  de la geometría de la cámara no modifica el desnivel. El mapa sin editar usa
  también el XML original y al editar calcula sobre los puntos modificados.
- Las comparaciones guardadas conservan sus cifras históricas; las nuevas
  incluyen el grado. No se regeneran informes de IA ni se consume saldo al
  consultar estadísticas recalculadas.
- Desplegar juntos el frontend y el WAR. No se han modificado datos de producción
  durante el desarrollo.

## Verificación

`node scripts/test-elevation.cjs <fixtures.json>` ejecuta 37 regresiones:
A/B/C, ruido, densidades distintas, huecos, segmentos, descenso, picos y 160.000
puntos. `GpxElevationServiceTest` compara desnivel, extremos, distancia, estado,
grado e indicadores entre Java y TypeScript. En la revisión local se añaden los
tres GPX del usuario sin guardar sus recorridos privados en el repositorio.
Las nuevas regresiones contrastan ruido correlacionado sobre dos subidas conocidas
y colinas cortas reales de 6 m a densidades de 1, 5 y 20 m.

`test-elevation-quality-browser.cjs` verifica clasificación al importar, badges
del archivo/planificación, explicación al pulsar y anchuras de 390/1440 px.
