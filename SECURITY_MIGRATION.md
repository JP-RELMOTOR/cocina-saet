# Activación segura de Firebase

Este repositorio ya contiene la app preparada para exigir usuarios autenticados y el robot preparado para autenticarse. La última parte se hace en las consolas de Firebase y GitHub; no se deben guardar contraseñas ni secretos en archivos del proyecto.

## Orden seguro

1. En Firebase Console abre **Authentication > Sign-in method** y habilita **Correo electrónico/contraseña**.
2. En **Authentication > Users**, crea una cuenta para cada persona que necesite usar los datos compartidos. Crea además una cuenta técnica exclusiva, por ejemplo `cocina-sync@...`, para el robot.
3. En GitHub, en **Settings > Secrets and variables > Actions**, crea estos secretos:
   - `FIREBASE_SYNC_EMAIL`: correo de la cuenta técnica.
   - `FIREBASE_SYNC_PASSWORD`: contraseña de esa cuenta.
   - `FIREBASE_API_KEY`: la `apiKey` de `config.js`. No es secreta, pero se mantiene centralizada para que el workflow no dependa del código.
4. Publica primero este código. Antes de activar las reglas nuevas, abre la app, toca el punto de conexión y valida que una cuenta creada pueda iniciar sesión.
5. En **Realtime Database > Rules**, reemplaza las reglas por el contenido de `database.rules.json` y pulsa **Publish**.
6. Ejecuta manualmente el workflow **Sincronizar onces desde la web**. Debe superar la etapa de pruebas y actualizar Firebase con la cuenta técnica.

## Qué cambia

- Sin sesión, la app conserva datos locales pero no lee ni escribe los datos compartidos.
- Con una cuenta creada por el administrador, cada integrante puede usar la sincronización normalmente.
- El PIN de modo administrador sigue siendo una capa de interfaz, no una identidad de seguridad. La protección real son las cuentas de Firebase y las reglas.

## Reversión de emergencia

Si algo falla después de publicar las reglas, vuelve temporalmente a las reglas anteriores desde el historial de Firebase Rules. No borres datos de `cocina`. Luego revisa que los tres secretos de GitHub y la cuenta técnica estén correctamente configurados.
