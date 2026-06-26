#!/usr/bin/env bash
# Versiona sw.js automáticamente con un hash del contenido que se cachea.
# Así el banner "✨ versión nueva" aparece SOLO cuando algo cambió de verdad,
# y nunca hay que acordarse de subir la versión a mano.
# Lo llama el hook de auto-deploy (.claude/settings.json) antes de commitear.
# Uso: bash scripts/bump-sw-version.sh [ruta-del-repo]   (por defecto: .)
REPO="${1:-.}"
VER=$(cat "$REPO/index.html" "$REPO/recetas-data.js" "$REPO/manifest.json" 2>/dev/null | shasum | cut -c1-10)
[ -n "$VER" ] && sed -i '' "s/const CACHE = \"[^\"]*\";/const CACHE = \"cocina-saet-$VER\";/" "$REPO/sw.js"
exit 0
