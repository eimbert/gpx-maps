# GpxMapViewer

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 14.2.4.

## API de autenticación

La aplicación espera un backend con los siguientes puntos finales de autenticación:

* `POST /api/auth/login` → cuerpo `{ email, password }` → respuesta `{ user: { id, email, displayName, roles }, accessToken, refreshToken, expiresIn }`.
* `POST /api/auth/refresh` → cuerpo `{ refreshToken }` → respuesta `{ accessToken, expiresIn }`.
* `POST /api/auth/logout` → cuerpo `{ refreshToken }` → respuesta vacía con código 204.
* `GET /api/auth/me` → encabezado `Authorization: Bearer <token>` → respuesta `{ id, email, displayName, roles }`.

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
