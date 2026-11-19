// Rodeo de cría · APSAVET — guarda la app en el celular para que abra sin señal
// Abre siempre al instante desde la copia guardada y, si hay señal, baja la versión nueva
// en segundo plano (se ve la próxima vez que se abre).
const VERSION = "rc-v38";
const ARCHIVOS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Pide a la red con un tope de tiempo: con señal mala no se queda colgado
function deLaRed(req, ms) {
  return new Promise((ok, mal) => {
    const t = setTimeout(() => mal(new Error("sin señal")), ms);
    fetch(req).then(r => { clearTimeout(t); ok(r); }, err => { clearTimeout(t); mal(err); });
  });
}

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return; // el servidor de datos va siempre por la red

  const esPagina = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
  const clave = esPagina ? "./index.html" : req;

  const actualizar = fetch(req, { cache: "no-store" }).then(async r => {
    if (!r || !r.ok) return r;
    const c = await caches.open(VERSION);
    if (esPagina) {
      // si la página cambió, avisarle a la app para que se recargue con la versión nueva
      const vieja = await c.match(clave);
      const txtNuevo = await r.clone().text();
      const txtViejo = vieja ? await vieja.text() : null;
      await c.put(clave, r.clone());
      if (txtViejo !== null && txtViejo !== txtNuevo) {
        const cs = await self.clients.matchAll({ type: "window" });
        cs.forEach(cl => cl.postMessage({ tipo: "nueva-version" }));
      }
    } else {
      await c.put(clave, r.clone());
    }
    return r;
  });

  e.respondWith(
    caches.match(clave, { ignoreSearch: true }).then(guardada => {
      if (guardada) { e.waitUntil(actualizar.catch(() => {})); return guardada; } // al instante
      return deLaRed(req, 8000).catch(() => caches.match("./index.html"));    // primera vez
    })
  );
});
