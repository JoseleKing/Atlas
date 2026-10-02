/* Atlas · mapa.js
   Los lugares del juego y dónde se escribe su nombre sobre el mapa.
   Los contornos de los países están en mapa-trazados.js (generado; no se edita a mano).

   Cada lugar tiene:
   - nombre:   nombre completo (aparece en el mapa, al elegir y en los resultados).
   - corto:    nombre que se escribe en el mapa si el completo no cabe.
   - region:   Europa, Canarias, Norteamérica, Centroamérica, Caribe, Andes o Cono Sur.
   - lat/lon:  centro aproximado, para calcular distancias y direcciones de las pistas.
   - etiqueta: centro del nombre en el lienzo del mapa (TRAZADOS.ANCHO × TRAZADOS.ALTO
               unidades; en un móvil, 1 unidad ≈ 1 px).
   - ancla:    (opcional) punto del país al que llega la línea guía, para los países
               pequeños cuyo nombre se escribe en el mar.
   - lado:     (opcional) 'izquierda' si el nombre va a la izquierda de etiqueta.x
               (su final queda en ese punto) en vez de centrado en él.

   Los códigos (ES, MX, CU…) son los que se usan en «lugares» de palabras.json. */

const LUGARES = {
  'ES':    { nombre: 'España',               region: 'Europa',        lat: 40.2,  lon: -3.6,   etiqueta: { x: 316, y: 32 } },
  'ES-CN': { nombre: 'Canarias',             region: 'Canarias',      lat: 28.3,  lon: -15.6,  etiqueta: { x: 326, y: 73 } },
  'MX':    { nombre: 'México',               region: 'Norteamérica',  lat: 23.6,  lon: -102.5, etiqueta: { x: 72,  y: 50 } },
  'GT':    { nombre: 'Guatemala',            region: 'Centroamérica', lat: 15.7,  lon: -90.3,  etiqueta: { x: 114, y: 116 }, lado: 'izquierda', ancla: { x: 124, y: 94 } },
  'SV':    { nombre: 'El Salvador',          region: 'Centroamérica', lat: 13.8,  lon: -88.9,  etiqueta: { x: 114, y: 152 }, lado: 'izquierda', ancla: { x: 134, y: 104 } },
  'HN':    { nombre: 'Honduras',             region: 'Centroamérica', lat: 14.8,  lon: -86.6,  etiqueta: { x: 158, y: 83 },  ancla: { x: 150, y: 95 } },
  'NI':    { nombre: 'Nicaragua',            region: 'Centroamérica', lat: 12.9,  lon: -85.0,  etiqueta: { x: 114, y: 188 }, lado: 'izquierda', ancla: { x: 151, y: 112 } },
  'CR':    { nombre: 'Costa Rica',           region: 'Centroamérica', lat: 9.9,   lon: -84.1,  etiqueta: { x: 114, y: 224 }, lado: 'izquierda', ancla: { x: 159, y: 125 } },
  'PA':    { nombre: 'Panamá',               region: 'Centroamérica', lat: 8.5,   lon: -80.1,  etiqueta: { x: 114, y: 260 }, lado: 'izquierda', ancla: { x: 178, y: 132 } },
  'CU':    { nombre: 'Cuba',                 region: 'Caribe',        lat: 21.5,  lon: -79.0,  etiqueta: { x: 176, y: 64 } },
  'DO':    { nombre: 'República Dominicana', corto: 'R. Dominicana', region: 'Caribe', lat: 18.9, lon: -70.5, etiqueta: { x: 228, y: 45 }, ancla: { x: 231, y: 76 } },
  'PR':    { nombre: 'Puerto Rico',          region: 'Caribe',        lat: 18.2,  lon: -66.5,  etiqueta: { x: 292, y: 100 }, ancla: { x: 254, y: 81 } },
  'CO':    { nombre: 'Colombia',             region: 'Andes',         lat: 4.1,   lon: -72.9,  etiqueta: { x: 210, y: 156 } },
  'VE':    { nombre: 'Venezuela',            region: 'Andes',         lat: 7.1,   lon: -66.2,  etiqueta: { x: 264, y: 131 } },
  'EC':    { nombre: 'Ecuador',              region: 'Andes',         lat: -1.5,  lon: -78.4,  etiqueta: { x: 190, y: 186 } },
  'PE':    { nombre: 'Perú',                 region: 'Andes',         lat: -9.2,  lon: -75.0,  etiqueta: { x: 212, y: 230 } },
  'BO':    { nombre: 'Bolivia',              region: 'Andes',         lat: -16.7, lon: -64.7,  etiqueta: { x: 262, y: 262 } },
  'CL':    { nombre: 'Chile',                region: 'Cono Sur',      lat: -35.7, lon: -71.5,  etiqueta: { x: 196, y: 330 }, lado: 'izquierda', ancla: { x: 212, y: 330 } },
  'AR':    { nombre: 'Argentina',            region: 'Cono Sur',      lat: -35.4, lon: -65.2,  etiqueta: { x: 240, y: 380 } },
  'UY':    { nombre: 'Uruguay',              region: 'Cono Sur',      lat: -32.8, lon: -56.0,  etiqueta: { x: 326, y: 374 }, ancla: { x: 292, y: 355 } },
  'PY':    { nombre: 'Paraguay',             region: 'Cono Sur',      lat: -23.4, lon: -58.4,  etiqueta: { x: 285, y: 304 } },
};

// Rótulos decorativos de mares y océanos (solo adorno, no se pueden tocar).
const ROTULOS = [
  { texto: 'Golfo de México',  x: 128, y: 36 },
  { texto: 'Mar Caribe',       x: 214, y: 101 },
  { texto: 'Océano Pacífico',  x: 96,  y: 400 },
  { texto: 'Océano Atlántico', x: 318, y: 430, girado: -90 },
];

/* ---------- Cálculos geográficos ---------- */

const RADIO_TIERRA_KM = 6371;
const aRad = (g) => (g * Math.PI) / 180;

// Distancia en km entre dos lugares (fórmula del haversine).
function distanciaKm(a, b) {
  const dLat = aRad(b.lat - a.lat);
  const dLon = aRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(aRad(a.lat)) * Math.cos(aRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(h));
}

// Rumbo de «a» hacia «b» en grados (0 = norte, 90 = este…), tal como se vería
// en un mapa plano. Así la flecha coincide con lo que el jugador ve en pantalla.
function rumbo(a, b) {
  const este = (b.lon - a.lon) * Math.cos(aRad((a.lat + b.lat) / 2));
  const norte = b.lat - a.lat;
  return ((Math.atan2(este, norte) * 180) / Math.PI + 360) % 360;
}

// Nombre del rumbo en ocho direcciones: «el norte», «el sureste»…
function nombreRumbo(grados) {
  const nombres = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
  return nombres[Math.round(grados / 45) % 8];
}
