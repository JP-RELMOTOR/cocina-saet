# Acceso a los datos compartidos

## Cómo funciona hoy (agosto 2026)

- La app **no pide correo ni contraseña** a nadie. Para editar basta la clave del equipo (`adminPin` de `config.js`), igual que al principio.
- Todo lo que se edita se guarda en Realtime Database, así que **todos los voluntarios ven lo mismo** en su teléfono.
- Las reglas publicadas en Firebase son las abiertas. El robot de sincronización escribe sin credenciales.
- Al abrir, la app intenta una sesión **anónima** en silencio. Hoy el proyecto no la tiene activada y no pasa nada: se reintenta solo si alguna vez la nube rechaza una escritura.

Se probó y se descartó exigir una cuenta de Firebase por persona: dejaba fuera al equipo (nadie recuerda esa contraseña) y las ediciones quedaban encerradas en un teléfono. Si vuelves a tocar esto, no reintroduzcas ese requisito sin resolver antes cómo entra el equipo.

## Si algún día quieres cerrar la base

`database.rules.json` contiene reglas que exigen `auth != null`. **No las publiques sin hacer los tres pasos completos**, o la app y el robot dejan de escribir:

1. En Firebase Console, **Authentication > Sign-in method**, habilita **Anónimo**. Con eso la app se identifica sola, sin pedir nada a nadie (el código ya lo hace).
2. Crea una cuenta técnica de correo/contraseña para el robot (por ejemplo `cocina-sync@…`) y guárdala en GitHub, en **Settings > Secrets and variables > Actions**:
   - `FIREBASE_SYNC_EMAIL`, `FIREBASE_SYNC_PASSWORD` y `FIREBASE_API_KEY` (la `apiKey` de `config.js`).
3. Recién entonces publica las reglas de `database.rules.json` y lanza a mano el workflow **Sincronizar onces desde la web** para comprobar que el robot sigue escribiendo.

Ten presente qué protege eso realmente: la sesión anónima no distingue personas, así que evita que un curioso escriba con `curl`, pero no reemplaza la clave del equipo. La clave del PIN sigue siendo la puerta de la edición en la app.

## Reversión de emergencia

Si algo falla tras publicar reglas nuevas, vuelve a las anteriores desde el historial de **Realtime Database > Rules**. No borres datos de `cocina`.
