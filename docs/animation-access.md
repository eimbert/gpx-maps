# Acceso a las animaciones

El frontend corta a mitad de reproducción tanto «Descubrir ruta» como «Animar carrera» cuando no hay una cuenta verificada. El visitante puede registrarse y confirmar su correo; al volver, inicia una animación nueva desde el principio. Una cuenta gratis dispone de una reproducción completa cada 15 días, compartida entre los dos modos. Premium y Admin no tienen límite.

## API de cuentas

El backend `PayGoon` ofrece `GET /account/animations` para consultar la disponibilidad y `POST /account/animations/claim` para consumir un uso. Ambas operaciones exigen autenticación y correo verificado. La respuesta contiene `allowed`, `nextAvailableAt`, `daysRemaining` y `plan`. La solicitud de consumo bloquea la fila del usuario y guarda `last_animation_at` solo para cuentas gratis. El servidor calcula los 15 días; no depende del reloj ni del almacenamiento del navegador.

La reproducción y la grabación de pantalla se ejecutan en el navegador. Esta cuota controla la autorización de la aplicación, aunque un cliente modificado que ya tenga el GPX podría omitir su interfaz. Si en el futuro se generan vídeos en el servidor, el mismo control debe aplicarse también allí.
