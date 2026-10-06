/* Atlas · sw.js
   Service worker sencillo para jugar sin conexión.
   - Archivos propios: primero la red (así llegan las palabras y cambios nuevos)
     y, si no hay conexión, la copia guardada.
   - Fuentes de Google: primero la caché, porque no cambian.
   Si cambias la lista de archivos, sube el número de VERSION. */

const VERSION = 'atlas-v8';
const FUENTES = 'atlas-fuentes';

const ARCHIVOS = [
  './',
  'index.html',
  'reiniciar/',
  'estilos.css',
  'juego.js',
  'mapa.js',
  'mapa-trazados.js',
  'palabras.json',
  'volver-almanaque.js',
  'manifest.json',
  'icons/logo.svg',
  'icons/icono.svg',
  'icons/favicon-32.png',
  'icons/icono-192.png',
  'icons/icono-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ARCHIVOS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => c !== VERSION && c !== FUENTES).map((c) => caches.delete(c)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);

  // Fuentes de Google: caché primero; si no están, se descargan y se guardan.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    evento.respondWith(
      caches.open(FUENTES).then((cache) =>
        cache.match(peticion).then((guardada) =>
          guardada || fetch(peticion).then((respuesta) => {
            if (respuesta.ok || respuesta.type === 'opaque') cache.put(peticion, respuesta.clone());
            return respuesta;
          }),
        ),
      ),
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Archivos propios: red primero, caché si no hay conexión.
  // ignoreSearch hace que «?dia=3» u otros parámetros encuentren la página guardada.
  evento.respondWith(
    fetch(peticion)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put(peticion, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(peticion, { ignoreSearch: true })),
  );
});
