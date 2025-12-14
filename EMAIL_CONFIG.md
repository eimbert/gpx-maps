# SMTP configuration examples

Si ves errores como `MailAuthenticationException: Authentication failed` o `AuthenticationFailedException: failed to connect, no password specified?`, suele deberse a que faltan las credenciales SMTP. Configura estas propiedades en tu `application.properties` o como variables de entorno:

```
spring.mail.host=${MAIL_HOST}
spring.mail.port=${MAIL_PORT}
spring.mail.username=${MAIL_USERNAME}
spring.mail.password=${MAIL_PASSWORD}
spring.mail.properties.mail.smtp.auth=true
spring.mail.properties.mail.smtp.starttls.enable=true
```

### Cómo depurar el envío
Si necesitas ver qué valores está tomando la configuración SMTP justo antes de enviar un correo, añade un log explícito en el
punto donde construyas el `SimpleMailMessage` (o equivalente). Procura no volcar la contraseña sin enmascararla:

```java
@Slf4j
@Service
public class MailService {

  private final JavaMailSender mailSender;
  private final Environment env;

  public MailService(JavaMailSender mailSender, Environment env) {
    this.mailSender = mailSender;
    this.env = env;
  }

  public void sendEmail(SimpleMailMessage message) {
    // Log de valores de configuración antes de enviar
    String host = env.getProperty("spring.mail.host", "localhost");
    String port = env.getProperty("spring.mail.port", "1025");
    String username = env.getProperty("spring.mail.username", "");
    String password = env.getProperty("spring.mail.password", "");

    log.info("SMTP host: {}", host);
    log.info("SMTP port: {}", port);
    log.info("SMTP username: {}", username);
    log.info("SMTP password (masked): {}", password.isBlank() ? "<vacía>" : "****" + password.substring(Math.max(0, password.length() - 2)));

    mailSender.send(message);
  }
}
```

En entornos con perfiles o valores por defecto, puedes ajustarlo a las variables con fallback, por ejemplo `MAIL_HOST:localhos`
t, `MAIL_PORT:1025`, etc., tal y como se definen arriba.

## Valores habituales
- **Gmail (contraseña de aplicación)**
  - `MAIL_HOST=smtp.gmail.com`
  - `MAIL_PORT=587`
  - `MAIL_USERNAME=tu-cuenta@gmail.com`
  - `MAIL_PASSWORD=<contraseña de aplicación>`
- **Outlook/Office 365**
  - `MAIL_HOST=smtp.office365.com`
  - `MAIL_PORT=587`
  - `MAIL_USERNAME=tu-cuenta@dominio.com`
  - `MAIL_PASSWORD=<contraseña o app password>`
- **Servidor local (por ejemplo MailHog/Mailpit para desarrollo)**
  - `MAIL_HOST=localhost`
  - `MAIL_PORT=1025`
  - `MAIL_USERNAME=` (vacío si no requiere autenticación)
  - `MAIL_PASSWORD=` (vacío si no requiere autenticación)

## Consejos
- Usa siempre contraseñas de aplicación cuando el proveedor las requiera (Gmail, O365) y habilita STARTTLS en el puerto 587.
- Si el servidor requiere SSL puro (465), cambia `MAIL_PORT=465` y añade `spring.mail.properties.mail.smtp.ssl.enable=true`.
- Verifica que las variables estén definidas en el entorno donde corre la aplicación y que el perfil activo cargue el archivo de configuración correcto.
