/* Cocina SAET · Service Worker
   Estrategia híbrida:
   - HTML / navegación  -> NETWORK-FIRST (siempre intenta traer fresh de GitHub Pages)
   - Libs externas (cdn) -> CACHE-FIRST (no cambian)
   La versión de CACHE se genera SOLA con el hash del contenido cacheado
   (scripts/bump-sw-version.sh, llamado por el hook de deploy). No editar a mano. */
const CACHE = "cocina-saet-41151b5be0";
const PRECACHE = ["./", "./index.html", "./manifest.json", "./recetas-data.js",
  "./icon-192.png", "./icon-512.png", "./logo.png",
  "./img/montaje-almuerzo-1.jpg", "./img/montaje-almuerzo-2.jpg",
  "./img/montaje-desayuno-1.jpg", "./img/montaje-desayuno-2.jpg", "./img/montaje-once-1.jpg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {})
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// El cliente dispara esto cuando el usuario toca "Actualizar" en el banner.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const external = url.origin !== self.location.origin;

  // Libs externas (unpkg, cdnjs, fonts) -> cache-first
  if (external) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) =>
          hit || fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => hit)
        )
      )
    );
    return;
  }

  // Navegación / HTML mismo-origen -> network-first
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req)
        .then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; })
        .catch(() => caches.match(req).then((m) => m || caches.match("./index.html")))
    );
    return;
  }

  // Imágenes mismo-origen -> cache-first (persisten offline tras la primera carga online)
  if (req.destination === "image" || /\.(png|jpe?g|svg|webp|gif)$/i.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) =>
          hit || fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit)
        )
      )
    );
    return;
  }

  // Otros recursos mismo-origen (recetas-data.js, manifest, íconos) -> network-first con fallback a cache
  e.respondWith(
    fetch(req)
      .then((res) => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return res; })
      .catch(() => caches.match(req))
  );
});
