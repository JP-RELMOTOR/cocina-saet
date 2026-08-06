# Mantenimiento de Cocina SAET

## Verificaciones locales

Con Node 20 o superior:

```sh
npm test
```

Las pruebas protegen el parser de menús para que una fecha de otro año no vuelva a detener la sincronización.

## Despliegue

El hook de `.claude/settings.json` era específico de Claude Code. Al trabajar fuera de ese entorno, el despliegue debe ser intencional: revisar los cambios, actualizar la versión del service worker y publicar a `main` mediante el flujo de GitHub del equipo.

El service worker incluye `config.js` en el precache. Cada cambio en la app, recetas, configuración o manifest debe actualizar la versión de caché con:

```sh
bash scripts/bump-sw-version.sh .
```

## Estructura actual y evolución

- `index.html`: interfaz y lógica de negocio existente.
- `config.js`: configuración pública de Firebase y opciones de aplicación.
- `recetas-data.js`: recetario independiente.
- `scripts/sync-menus.js`: sincronizador de la fuente oficial.
- `tests/`: pruebas del sincronizador.

La primera separación segura ya está aplicada: configuración, recetas y sincronización están fuera de la interfaz. La siguiente fase, sin cambiar el comportamiento, es extraer los estilos y luego dividir la lógica de `index.html` por vistas. Esa migración debe hacerse por bloques pequeños y con una comprobación visual de cada vista, no como una reescritura total.
