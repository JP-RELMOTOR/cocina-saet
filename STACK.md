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

| Pieza | Qué es | Para qué la usamos | Costo |
|---|---|---|---|
| **HTML + CSS + JavaScript "vanilla"** | Un solo archivo `index.html`, sin frameworks (sin React) | Toda la app: pantallas, lógica, estilos | Gratis |
| **GitHub** | Repositorio de código | Guardar el código y versiones | Gratis |
| **GitHub Pages** | Hosting de sitios estáticos | Publicar la app en una URL (`usuario.github.io/proyecto/`) | Gratis |
| **Firebase Realtime Database** | Base de datos en la nube (Google) | Que todos los dispositivos vean/compartan los datos **en tiempo real** | Gratis (plan Spark) |
| **PWA** (manifest + service worker) | Tecnología web para "app instalable" | Instalar en el celular como app, ícono, funcionar offline, banner de actualización | Gratis |
| **GitHub Actions** | Automatización tipo "cron" en la nube | Un robot que cada día lee una web y actualiza la base de datos, **sin PC encendido** | Gratis |
| **Node.js** (en el Action) | Lenguaje para el script del robot | Scrapear (leer) la página oficial y parsear los datos | Gratis |
| **Librerías por CDN** | Firebase SDK, SortableJS (arrastrar y soltar) | Sync en vivo y reordenar tareas | Gratis |
| **Claude Code** | Asistente de desarrollo | Construir todo + auto-deploy | — |

---

## 3) Técnicas y patrones clave (lo que hizo la diferencia)

- **Offline-first con doble guardado:** `localStorage` (rápido, local) + Firebase (compartido). La app funciona sin internet y sincroniza al reconectar.
- **Sync en tiempo real:** un *listener* de Firebase (`fbRef.on('value', …)`) actualiza la pantalla apenas cambia algo en cualquier dispositivo.
- **Migraciones de datos** (`migV1, migV2, …`): para cambiar la estructura de datos sin romper lo que ya estaba guardado en la nube.
- **Datos "de solo lectura" para el robot:** algunos datos los escribe SOLO el robot (menús) y la app nunca los pisa. Truco: usar `.update()` en vez de `.set()` y sacar esos campos del "push" del cliente, para evitar que un cliente borre lo del robot (problema de *clobber*).
- **Robot anti-desastres:** el script valida (`sane()`) antes de escribir; si el parseo falla, NO escribe → nunca destruye datos buenos. Y compara contra la nube para no escribir de más.
- **PWA con service worker híbrido:** HTML *network-first* (siempre trae lo último), librerías *cache-first* (rápidas). Banner "✨ versión nueva → Actualizar" al cambiar la versión del caché.
- **Modo admin con PIN fijo** en el código (ojo: NO es seguridad real, solo evita ediciones accidentales; el PIN es visible en el código).
- **Reset semanal automático**, tareas auto-gestionadas según el menú, asignación automática a roles, cuenta regresiva en vivo, modo oscuro con variables CSS, visor de fotos con zoom (lightbox), arrastrar para reordenar (SortableJS).
- **Auto-deploy:** un *hook* de Claude Code que hace `git add/commit/push` en cada cambio → la app se publica sola.

---

## 4) La "lista de compras" para un proyecto nuevo

1. **Cuenta de GitHub** (gratis) → repo + Pages + Actions.
2. **Cuenta de Firebase** (gratis) → un proyecto con Realtime Database.
3. **Claude Code** para construir + el hook de auto-deploy.
4. (Opcional) Imágenes/íconos para la PWA.

Sin tarjeta de crédito, sin servidores, sin costo mensual.

---

## 5) Pasos para replicarlo (orden sugerido)

1. **Repo + Pages:** crea el repositorio en GitHub y activa Pages (rama `main`).
2. **App base:** un `index.html` (HTML+CSS+JS en un archivo) pensado mobile-first.
3. **PWA:** agrega `manifest.json`, `sw.js` (service worker) e íconos → ya es instalable.
4. **Base de datos:** crea proyecto en Firebase → Realtime Database → copia el `firebaseConfig` → pégalo en la app. Carga el SDK por CDN.
5. **Sync:** lee/escribe un "documento" JSON y escucha cambios con un listener.
6. **Auto-deploy:** configura el hook PostToolUse en `.claude/settings.json` para `git push` automático.
7. **(Opcional) Robot:** `.github/workflows/*.yml` con `cron` + un script Node que actualice la base de datos por REST.

---

## 6) Límites / cosas a tener en cuenta

- **Seguridad:** las reglas de Firebase quedaron **abiertas** (test mode) — sirve para datos no sensibles. Para algo privado: cerrar reglas + autenticación (Firebase Auth) o tokens.
- **Scraping frágil:** si la web origen cambia su estructura, el robot puede romperse (por eso los chequeos de sanidad). No depender de webs ajenas para datos críticos.
- **PIN visible:** el "modo admin" no es seguridad real.
- **Plan gratis de Firebase:** suficiente para apps pequeñas/medianas; tiene límites de tráfico/almacenamiento generosos para este uso.

---

*Hecho con cariño en el proyecto Cocina SAET 🍀 — guarda este archivo y cópialo a tu próximo proyecto como punto de partida.*
