# GpxMapViewer

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 14.2.4.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

### Cómo probar el adversario virtual

1. Instala dependencias si aún no lo has hecho: `npm install`.
2. Levanta el entorno de desarrollo: `npm run start` o `ng serve`.
3. Accede a `http://localhost:4200/` y carga únicamente el GPX del player 1.
4. Pulsa **Iniciar** para abrir el cuadro de configuración.
5. Marca la casilla **“¿Quieres añadir un adversario virtual (player 2)?”**.
6. Introduce el **Tiempo objetivo (hh:mm)** que debe emplear el adversario virtual (p. ej. `00:45`).
7. Confirma el diálogo: se generará un player 2 con ritmo coherente con las pendientes del track cargado y se mostrará junto al player 1 en el mapa.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

> Nota: Karma necesita un navegador Chrome/Chromium disponible. Si tu entorno no tiene un binario instalado por defecto,
> puedes exportar la ruta con `CHROME_BIN=/ruta/a/chromium` antes de lanzar los tests o instalar `chromium-browser`/`google-chrome`.
> En CI o contenedores suele funcionar el modo sin sandbox: `ng test --watch=false --browsers=ChromeHeadless --no-sandbox`.

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.

## SMTP configuration quickstart

Si necesitas configurar envío de correos (por ejemplo, para verificar cuentas en un backend Spring Boot), revisa `EMAIL_CONFIG.md`.

## Clasificar tracks por dureza (propuesta recomendada)

Para comparar rutas dentro de una carpeta (o entre carpetas) conviene separar la dificultad en **3 bloques** y luego mezclar:

1. **Carga / volumen** (50%)
   - Distancia total (`distance_km`)
   - Desnivel positivo (`desnivel`)
   - Tiempo en movimiento (`moving_time_sec`) cuando exista

2. **Pendiente y picos** (35%)
   - Pendiente media de subida
   - Percentil 95 de pendiente en subida (`p95_uphill_grade`)
   - Porcentaje de subida por encima del 10% y 15%
   - Máxima subida sostenida por encima de un umbral (ej. ≥10%)

3. **Rompepiernas / técnica estimada** (15%)
   - `vertical_churn = (sumUp + |sumDown|) / distanceKm`
   - Número de bloques de ascenso (repechos)
   - Densidad de paradas `stop_density = (total - moving) / distanceKm`
   - Curvatura (`twistiness`) como aproximación de trazado técnico

### Cómo calcular bien la pendiente (evitando ruido GPS)

- Suavizar elevación antes de derivar pendiente (media móvil o similar).
- Calcular pendiente por ventanas de distancia (200 m por defecto en MTB, mínimo 100 m).
- Ignorar segmentos con distancia muy pequeña o datos atípicos.
- Aplicar límites razonables de pendiente para descartar outliers (p. ej. ±30%).

### Regla de empates (equivalencias creíbles)

Permitir empate entre rutas si:

- diferencia del score total < 5%
- **y** diferencia del subscore de pendiente/picos < 8%

Así se evita declarar equivalentes dos tracks con el mismo desnivel, pero con rampas muy distintas.

### Qué enseñar en la UI para que se entienda la clasificación

Además de la etiqueta final (Suave / Media / Dura / Muy dura), mostrar:

- Desnivel + distancia
- P95 pendiente + metros en subida >10%
- Máxima subida sostenida (ej. "1.2 km a ≥10%")
- Índice rompepiernas (churn o nº de repechos)

Con estos indicadores es fácil explicar por qué una ruta de **500 m en 5 km** suele ser más exigente que otra de **500 m en 15 km**.
