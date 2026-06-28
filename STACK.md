# 🧰 Stack técnico — receta para repetir este tipo de app

Resumen de TODO lo que usamos en **Cocina SAET**, para reutilizarlo en futuros proyectos.
La gran idea: **una app web instalable, en tiempo real, sin servidor propio y gratis.**

---

## 1) La arquitectura en una frase

> **No hay un servidor tradicional.** Es una página web estática (un solo archivo) + una base de datos en la nube + un robot programado. Todo gratis y sin mantener servidores.

```
   📱 Celular/PC                ☁️ Nube (Google)            🤖 GitHub
 ┌──────────────┐   lee/escribe ┌──────────────────┐      ┌──────────────────────┐
 │  index.html  │ ◀───────────▶ │ Firebase Realtime│      │ GitHub Pages (hosting)│
 │ (la app PWA) │   en vivo     │    Database      │      │ GitHub Actions (cron) │
 └──────────────┘               └──────────────────┘      └──────────────────────┘
        ▲                                ▲                          │
        │ se instala como app            │ el robot escribe         │ scrapea la web
        └── funciona offline (PWA)       └──────────────────────────┘ y actualiza la BD
```

---

## 2) Los componentes (qué, para qué, costo)

| Pieza | Qué es / Proveedor | Para qué la usamos | Costo |
|---|---|---|---|
| **Hosting** | **GitHub Pages** (sirve desde la rama `main`) | Publicar la app en una URL (`usuario.github.io/proyecto/`) | Gratis |
| **Código** | **GitHub** — repo `JP-RELMOTOR/cocina-saet` | Guardar el código y versiones | Gratis |
| **App** | `index.html` único (HTML+CSS+JavaScript "vanilla", **sin framework**) + `recetas-data.js` (datos de recetas) | Toda la app: pantallas, lógica, estilos | Gratis |
| **Base de datos** | **Firebase Realtime Database** (Google), plan **Spark** | Que todos los dispositivos vean/compartan los datos **en tiempo real** | Gratis |
| **PWA** | `manifest.json` + `sw.js` (service worker) + íconos | App instalable, ícono, offline, banner de actualización | Gratis |
| **Automatización** | **GitHub Actions** (cron en la nube) + **Node.js** | El robot que lee la web oficial y actualiza la BD, sin PC encendido | Gratis |
| **Librerías (CDN)** | Firebase SDK `10.12.2` (compat), **SortableJS** `1.15.6` | Sync en vivo + arrastrar para reordenar | Gratis |
| **Asistente** | **Claude Code** | Construir todo + auto-deploy | — |

---

## 3) Cómo usa la base de datos (Firebase Realtime Database)

- **Proveedor:** Firebase Realtime Database (Google). URL: `https://cocina-saet-default-rtdb.firebaseio.com`.
- **Config** (`firebaseConfig` con `apiKey`, `databaseURL`, etc.) va **embebida en `index.html`**. Es lo normal en Firebase web; la apiKey NO es secreta — la seguridad real son las **reglas**.
- **Cliente (la app):** carga el SDK por CDN → `firebase.database().ref('cocina')` y escucha cambios con `fbRef.on('value', …)`. Escribe con `.update()` (no `.set()` en la raíz) para no pisar lo que escribe el robot. De-dupe del último doc enviado para cortar bucles de escritura entre dispositivos.
- **Robot:** escribe por **REST** (`PUT https://…/cocina/doc/<sección>.json`) **sin autenticación** — depende de que las reglas permitan escritura.
- **Estructura de datos** (todo bajo `cocina`):
  - `cocina/doc` → estado de la app (menú, equipo, secciones, tareas, notas…) **+** datos del robot (`days`, `thursdays`, `onceDays`, `interTurnos`).
  - `cocina/done` y `cocina/brkDone` → mapas de tareas marcadas (booleanos).
- **Offline-first (doble guardado):** `localStorage` (rápido, local) + Firebase (compartido). Funciona sin internet y sincroniza al reconectar.

---

## 4) Seguridad

- **Reglas de Firebase** (`database.rules.json`, publicadas en consola): cerrado por defecto, solo el árbol `cocina` es accesible, validación de tipos (`done`/`brkDone` solo booleanos), y `$otro: validate false` para bloquear inyección de claves basura.
- **NO hay autenticación** (acceso anónimo): cualquiera con la URL podría sobrescribir datos *válidos*. Aceptable solo para **datos no sensibles**. Para algo privado: cerrar reglas + Firebase Auth.
- **PIN de admin** fijo en el código (`ADMIN_PIN`): NO es seguridad real, solo evita ediciones accidentales. Se auto-cierra a los 10 min de inactividad.

---

## 5) El robot de sincronización (lo más reutilizable)

- `scripts/sync-menus.js` (Node 20), ejecutado por **GitHub Actions** (`.github/workflows/sync-menus.yml`): cron diario `0 11 * * *` (~08:00 Chile) + lanzamiento manual.
- **Scrapea** páginas públicas de Google Sites (Residencia SAET) y actualiza Firebase:
  - Menús de **onces** y **almuerzos** de los jueves (con cantidades).
  - **Calendario completo** de todos los días (plato, ensalada, congregación, cantidades).
  - **Turnos por día** (quién cocina; auto-descubre páginas `turnos-eer-37`, `-38`, …).
  - **Turnos interescuela** (durante la pausa entre clases; página aparte).
- **Anti-desastres:** valida con funciones `sane…()` antes de escribir; si el parseo falla, **NO escribe** esa sección (nunca destruye datos buenos). Compara contra la nube para no escribir de más. Probar sin escribir: `DRY_RUN=1 node scripts/sync-menus.js`.
- **Alerta de fallo:** un paso `if: failure()` crea un **issue en GitHub** (llega correo) — el robot ya no falla en silencio.

---

## 6) Técnicas y patrones clave (lo que hizo la diferencia)

- **Migraciones de datos** (`migV`): cambiar la estructura sin romper lo guardado en la nube.
- **Datos "propiedad del robot":** algunos campos los escribe SOLO el robot (`days`, `thursdays`, `onceDays`, `interTurnos`); la app solo los lee. Truco: `.update()` en vez de `.set()` y sacarlos del "push" del cliente (evita el *clobber*).
- **PWA con service worker híbrido:** HTML *network-first* (siempre lo último), librerías e imágenes *cache-first* (rápidas/offline), precache del "shell" + recetas + fotos de montaje.
- **Versión del SW auto-generada** por hash del contenido (`scripts/bump-sw-version.sh`, llamado por el hook de deploy) → el banner "✨ versión nueva → Actualizar" aparece **solo cuando algo cambió**.
- **Auto-deploy:** un *hook* PostToolUse en `.claude/settings.json` hace `git add/commit/push` en cada cambio (y versiona el SW) → la app se publica sola.
- **Accesibilidad/UX:** áreas táctiles ≥40px, zoom permitido, modales propios en vez de `prompt()/confirm()` nativos, modo oscuro con variables CSS, reset semanal automático con aviso.
- Reset semanal, asignación automática a roles, cuenta regresiva en vivo, visor de fotos con zoom (lightbox), arrastrar para reordenar (SortableJS).

---

## 7) La "lista de compras" para un proyecto nuevo

1. **Cuenta de GitHub** (gratis) → repo + Pages + Actions.
2. **Cuenta de Firebase** (gratis) → un proyecto con Realtime Database.
3. **Claude Code** para construir + el hook de auto-deploy.
4. (Opcional) Imágenes/íconos para la PWA.

Sin tarjeta de crédito, sin servidores, sin costo mensual.

---

## 8) Pasos para replicarlo (orden sugerido)

1. **Repo + Pages:** crea el repositorio en GitHub y activa Pages (rama `main`).
2. **App base:** un `index.html` (HTML+CSS+JS en un archivo) pensado mobile-first.
3. **PWA:** agrega `manifest.json`, `sw.js` e íconos → ya es instalable.
4. **Base de datos:** crea proyecto en Firebase → Realtime Database → copia el `firebaseConfig` → pégalo en la app. Carga el SDK por CDN.
5. **Reglas:** cierra las reglas de Firebase (NO dejar en "test mode" abierto).
6. **Sync:** lee/escribe un "documento" JSON y escucha cambios con un listener.
7. **Auto-deploy:** configura el hook PostToolUse en `.claude/settings.json` para `git push` automático.
8. **(Opcional) Robot:** `.github/workflows/*.yml` con `cron` + un script Node que actualice la base de datos por REST (con `sane()` y alerta por issue).

---

## 9) Límites / cosas a tener en cuenta

- **Sin auth:** las reglas cerradas limitan el daño, pero sin autenticación no sirve para datos sensibles.
- **Scraping frágil:** si la web origen cambia su estructura, el robot puede romperse (por eso los `sane()` + la alerta por issue). No depender de webs ajenas para datos críticos.
- **PIN visible:** el "modo admin" no es seguridad real.
- **Plan gratis de Firebase:** suficiente para apps pequeñas/medianas; límites de tráfico/almacenamiento generosos para este uso.
- **GitHub Actions cron:** GitHub desactiva los cron si el repo queda ~60 días sin actividad (aquí no aplica por el auto-deploy frecuente).

---

*Hecho con cariño en el proyecto Cocina SAET 🍀 — guarda este archivo y cópialo a tu próximo proyecto como punto de partida.*
