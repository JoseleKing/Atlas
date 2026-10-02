/* Atlas · herramientas/generar-trazados.mjs
   Genera mapa-trazados.js (los contornos de los países ya proyectados) a partir de
   Natural Earth 1:50m (dominio público), vía el paquete world-atlas.

   No hace falta para jugar ni para publicar: solo si quieres cambiar el encuadre.
   Uso, desde la carpeta del proyecto:
     npm i --no-save world-atlas@2 topojson-client@3 topojson-simplify@3 d3-geo@3
     node herramientas/generar-trazados.mjs

   OJO: si cambias la proyección o el recuadro, revisa en mapa.js las posiciones
   de los nombres (etiqueta) y de los puntos de las líneas guía (ancla). */

import fs from 'fs';
import { createRequire } from 'module';
import * as tc from 'topojson-client';
import * as ts from 'topojson-simplify';
import * as d3 from 'd3-geo';

const require = createRequire(import.meta.url);
let mundo = JSON.parse(fs.readFileSync(require.resolve('world-atlas/countries-50m.json')));
mundo = ts.presimplify(mundo);
mundo = ts.simplify(mundo, ts.quantile(mundo, 0.35));
const paises = tc.feature(mundo, mundo.objects.countries).features;
const buscar = (nombre) => paises.find((f) => f.properties.name === nombre);

const ANCHO = 360;

// Nombres en Natural Earth de cada lugar del juego (España va aparte, en el recuadro).
const CODIGOS = {
  MX: 'Mexico', GT: 'Guatemala', SV: 'El Salvador', HN: 'Honduras', NI: 'Nicaragua',
  CR: 'Costa Rica', PA: 'Panama', CU: 'Cuba', DO: 'Dominican Rep.', PR: 'Puerto Rico',
  CO: 'Colombia', VE: 'Venezuela', EC: 'Ecuador', PE: 'Peru', BO: 'Bolivia',
  CL: 'Chile', AR: 'Argentina', UY: 'Uruguay', PY: 'Paraguay',
};
const HISPANOS = new Set([...Object.values(CODIGOS), 'Spain']);

/* ---------- Mapa principal: las Américas ---------- */

const encuadre = {
  type: 'MultiPoint',
  coordinates: [[-117.3, 32.6], [-47, 25], [-47, -5], [-47, -30], [-73, -55.5], [-66, -55.5]],
};
const proy = d3.geoAzimuthalEqualArea().rotate([80, 12]).fitWidth(ANCHO - 12, encuadre);
const [[x0, y0], [, y1]] = d3.geoPath(proy).bounds(encuadre);
proy.translate([proy.translate()[0] + 6 - x0, proy.translate()[1] + 8 - y0]);
const ALTO = Math.ceil(y1 - y0 + 14);
proy.clipExtent([[0, 0], [ANCHO, ALTO]]);
const ruta = d3.geoPath(proy).digits(1);

const paths = {};
for (const [codigo, nombre] of Object.entries(CODIGOS)) paths[codigo] = ruta(buscar(nombre));
const otros = paises.filter((f) => !HISPANOS.has(f.properties.name)).map((f) => ruta(f)).filter(Boolean).join('');
const reticula = ruta(d3.geoGraticule().step([10, 10])());
const ecuador = ruta({ type: 'LineString', coordinates: Array.from({ length: 181 }, (_, i) => [-180 + i * 2, 0]) });

/* ---------- Recuadro: España y Canarias ---------- */

const RECUADRO = { x: 266, y: 4, ancho: 90, alto: 80 };
const CAJA_CANARIAS = { x: RECUADRO.x, y: 62, ancho: 44, alto: RECUADRO.y + RECUADRO.alto - 62 };

// Separa las islas Canarias (al sur del paralelo 30) del resto de España.
const espana = buscar('Spain');
const poligonos = espana.geometry.type === 'MultiPolygon' ? espana.geometry.coordinates : [espana.geometry.coordinates];
const esCanarias = (p) => d3.geoCentroid({ type: 'Polygon', coordinates: p })[1] < 30;
const peninsula = { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: poligonos.filter((p) => !esCanarias(p)) } };
const canarias = { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: poligonos.filter(esCanarias) } };

const margen = 4;
const proyIberia = d3.geoConicConformal().parallels([36, 43]).rotate([3, 0])
  .fitExtent([[RECUADRO.x + margen, RECUADRO.y + margen], [RECUADRO.x + RECUADRO.ancho - margen, CAJA_CANARIAS.y - 2]],
    { type: 'MultiPoint', coordinates: [[-9.6, 43.9], [4.4, 39.8], [-9.6, 36], [3.3, 42.5]] })
  .clipExtent([[RECUADRO.x, RECUADRO.y], [RECUADRO.x + RECUADRO.ancho, CAJA_CANARIAS.y]]);
const rutaIberia = d3.geoPath(proyIberia).digits(1);
const vecinos = ['Portugal', 'France', 'Andorra', 'Morocco', 'Algeria'].map((n) => rutaIberia(buscar(n))).filter(Boolean).join('');

const proyCanarias = d3.geoMercator()
  .fitExtent([[CAJA_CANARIAS.x + 3, CAJA_CANARIAS.y + 3], [CAJA_CANARIAS.x + CAJA_CANARIAS.ancho - 3, CAJA_CANARIAS.y + CAJA_CANARIAS.alto - 3]], canarias);
const rutaCanarias = d3.geoPath(proyCanarias).digits(1);

paths['ES'] = rutaIberia(peninsula);
paths['ES-CN'] = rutaCanarias(canarias);

/* ---------- Salida ---------- */

const datos = {
  ANCHO, ALTO, RECUADRO, CAJA_CANARIAS,
  paises: paths,
  otros, vecinosEspana: vecinos, reticula, ecuador,
};
const salida = `/* Atlas · mapa-trazados.js
   ARCHIVO GENERADO por herramientas/generar-trazados.mjs: no lo edites a mano.
   Contornos de Natural Earth 1:50m (dominio público), ya proyectados al lienzo del mapa. */

const TRAZADOS = ${JSON.stringify(datos, null, 1)};
`;
fs.writeFileSync(new URL('../mapa-trazados.js', import.meta.url), salida);
console.log(`mapa-trazados.js: ${ANCHO}×${ALTO}, ${(salida.length / 1024).toFixed(1)} KB`);

// Puntos útiles para colocar nombres (centro de cada país en el lienzo).
for (const [codigo, nombre] of Object.entries(CODIGOS)) {
  const [x, y] = ruta.centroid(buscar(nombre));
  console.log(codigo.padEnd(6), Math.round(x), Math.round(y));
}
