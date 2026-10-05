/* Atlas · juego.js
   Lógica del juego: palabras del día, intentos y pistas, resultado, estadísticas,
   compartir y cuenta atrás.

   Para añadir palabras basta con editar palabras.json: cada elemento es un día con
   su lista de palabras (normalmente tres), que se juegan una tras otra. Los días se
   recorren en orden a partir de FECHA_INICIO y al acabarse se vuelve a empezar.

   Modo de prueba: añade ?dia=N a la dirección (por ejemplo index.html?dia=3)
   para jugar el día N sin guardar nada. */

'use strict';

/* ---------- Configuración ---------- */

const CONFIG = {
  FECHA_INICIO: '2026-10-02',  // día nº 1 (hora de Madrid), en formato AAAA-MM-DD
  ZONA_HORARIA: 'Europe/Madrid',
  INTENTOS: 3,
  CALIENTE_KM: 1500,           // por debajo: «Caliente»
  TEMPLADO_KM: 4000,           // por debajo: «Templado»; por encima: «Frío»
  MARGEN_KM: 150,              // diferencia mínima para decir «te acercas» o «te alejas»
  CLAVE: 'atlas:v1',           // clave en localStorage
};

/* ---------- Fechas en hora de Madrid ---------- */

// Fecha de Madrid como «AAAA-MM-DD».
function fechaMadrid(momento = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(momento);
}

// Días entre dos fechas «AAAA-MM-DD».
function diasEntre(desde, hasta) {
  const utc = (f) => { const [a, m, d] = f.split('-').map(Number); return Date.UTC(a, m - 1, d); };
  return Math.round((utc(hasta) - utc(desde)) / 86400000);
}

// Número del día de hoy: 1 el día de inicio, 2 el siguiente…
function numeroDeHoy() {
  return Math.max(1, diasEntre(CONFIG.FECHA_INICIO, fechaMadrid()) + 1);
}

// Segundos que faltan para la medianoche de Madrid.
function segundosHastaMedianoche() {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: CONFIG.ZONA_HORARIA, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const valor = (tipo) => Number(partes.find((p) => p.type === tipo).value);
  return 86400 - (valor('hour') * 3600 + valor('minute') * 60 + valor('second'));
}

/* ---------- Almacenamiento (siempre dentro de try/catch) ---------- */

function datosVacios() {
  return {
    ayudaVista: false,
    partida: null, // { numero, ronda, rondas: [[códigos de lugar] por palabra], terminada }
    // jugadas y ganadas cuentan días (se gana el día acertando todas sus palabras; la racha
    // cuenta días seguidos jugando, se gane o no);
    // palabras y acertadas cuentan palabras sueltas.
    stats: { jugadas: 0, ganadas: 0, palabras: 0, acertadas: 0, racha: 0, mejor: 0, ultimoGanado: null, ultimoJugado: null },
  };
}

// Datos guardados cuando Atlas tenía una sola palabra al día.
function migrar(guardado) {
  const p = guardado.partida;
  if (p && Array.isArray(p.intentos) && !Array.isArray(p.rondas)) {
    guardado.partida = { numero: p.numero, ronda: 0, rondas: [p.intentos], terminada: p.terminada };
  }
  const s = guardado.stats;
  if (s && s.palabras === undefined) {
    s.palabras = s.jugadas || 0;
    s.acertadas = s.ganadas || 0;
  }
}

function cargarDatos() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CONFIG.CLAVE));
    if (guardado && typeof guardado === 'object') {
      migrar(guardado);
      const vacio = datosVacios();
      return { ...vacio, ...guardado, stats: { ...vacio.stats, ...guardado.stats } };
    }
  } catch (e) { /* sin almacenamiento o datos dañados: se empieza de cero */ }
  return datosVacios();
}

function guardarDatos() {
  if (modoPrueba) return;
  try { localStorage.setItem(CONFIG.CLAVE, JSON.stringify(datos)); } catch (e) { /* se juega sin guardar */ }
}

/* ---------- Estado ---------- */

const parametroDia = new URLSearchParams(location.search).get('dia');
const modoPrueba = parametroDia !== null && /^\d+$/.test(parametroDia) && Number(parametroDia) >= 1;
const hoy = numeroDeHoy();
const numero = modoPrueba ? Number(parametroDia) : hoy;

let datos = cargarDatos();
let dia = [];            // palabras de hoy (entradas de palabras.json)
let rondas = [];         // intentos de cada palabra: [[{ codigo, acierto, km, rumbo, temperatura }]]
let ronda = 0;           // índice de la palabra en juego
let palabra = null;      // dia[ronda]
let intentos = [];       // rondas[ronda]
let palabraTerminada = false;
let terminada = false;   // todas las palabras del día jugadas
let seleccion = null;    // código del lugar elegido y aún no confirmado
let opciones = null;     // { lugares, x, y } si un toque cae entre varios lugares (x, y: fracción del mapa)
let temporizador = null;

const $ = (id) => document.getElementById(id);
const etiquetas = {};    // código → botón con el nombre en el mapa
const siluetas = {};     // código → contornos del país en el mapa (Centroamérica sale dos veces)

/* ---------- Evaluar un intento ---------- */

function evaluar(codigo, p = palabra) {
  if (p.lugares.includes(codigo)) return { codigo, acierto: true };

  // Lugar correcto más cercano al que se ha tocado.
  const origen = LUGARES[codigo];
  let cercano = null;
  let km = Infinity;
  for (const destino of p.lugares) {
    if (!LUGARES[destino]) continue;
    const d = distanciaKm(origen, LUGARES[destino]);
    if (d < km) { km = d; cercano = destino; }
  }
  const temperatura = km < CONFIG.CALIENTE_KM ? 'caliente' : km < CONFIG.TEMPLADO_KM ? 'templado' : 'frío';
  return { codigo, acierto: false, km, rumbo: rumbo(origen, LUGARES[cercano]), temperatura };
}

// Clave sin tilde de la temperatura, para clases y atributos: «frio», «templado», «caliente».
const claveTemperatura = (t) => (t === 'frío' ? 'frio' : t);

// Una palabra se acaba al acertarla o al gastar los intentos.
const acabada = (lista) => lista.some((i) => i.acierto) || lista.length >= CONFIG.INTENTOS;

/* ---------- Dibujo del mapa ---------- */

const SVG = 'http://www.w3.org/2000/svg';

function elementoSvg(etiqueta, atributos = {}) {
  const el = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
  return el;
}

// Flecha que apunta hacia arriba; se gira según el rumbo y se colorea según la temperatura.
function crearFlecha(grados, temperatura) {
  const svg = elementoSvg('svg', {
    viewBox: '0 0 20 20', class: 'flecha', 'data-temperatura': claveTemperatura(temperatura), 'aria-hidden': 'true',
  });
  const g = elementoSvg('g', { transform: `rotate(${Math.round(grados)} 10 10)` });
  g.appendChild(elementoSvg('path', {
    d: 'M10 2 L16 10 H12 V18 H8 V10 H4 Z', fill: 'currentColor',
  }));
  svg.appendChild(g);
  return svg;
}

// Rosa de los vientos grabada.
function crearRosa(x, y) {
  const rosa = elementoSvg('g', { class: 'mapa__rosa', transform: `translate(${x} ${y})` });
  rosa.appendChild(elementoSvg('circle', { r: 13 }));
  rosa.appendChild(elementoSvg('circle', { r: 9.5 }));
  rosa.appendChild(elementoSvg('path', { d: 'M0 -20 L3.5 0 L0 20 L-3.5 0 Z M-20 0 L0 3.5 L20 0 L0 -3.5 Z' }));
  rosa.appendChild(elementoSvg('path', { class: 'mapa__rosa-norte', d: 'M0 -20 L3.5 0 L-3.5 0 Z' }));
  const norte = elementoSvg('text', { y: -24, 'text-anchor': 'middle' });
  norte.textContent = 'N';
  rosa.appendChild(norte);
  return rosa;
}

function dibujarMapa() {
  const mapa = $('mapa');
  const { ANCHO, ALTO, RECUADRO: R, CAJA_CANARIAS: C, RECUADRO_CA: CA } = TRAZADOS;
  mapa.style.aspectRatio = `${ANCHO} / ${ALTO}`;

  const svg = elementoSvg('svg', { class: 'mapa__lienzo', viewBox: `0 0 ${ANCHO} ${ALTO}`, 'aria-hidden': 'true' });

  // Rayado de grabado para los lugares fallados
  const defs = elementoSvg('defs');
  const rayado = elementoSvg('pattern', {
    id: 'rayado', width: 3.5, height: 3.5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)',
  });
  rayado.appendChild(elementoSvg('rect', { width: 3.5, height: 3.5, fill: '#E3D6BE' }));
  rayado.appendChild(elementoSvg('line', { x1: 0, y1: 0, x2: 0, y2: 3.5, stroke: '#B9A88A', 'stroke-width': 1.2 }));
  defs.appendChild(rayado);
  svg.appendChild(defs);

  // Mar, retícula y ecuador
  svg.appendChild(elementoSvg('rect', { class: 'mapa__mar', width: ANCHO, height: ALTO }));
  svg.appendChild(elementoSvg('path', { class: 'mapa__reticula', d: TRAZADOS.reticula }));
  svg.appendChild(elementoSvg('path', { class: 'mapa__ecuador', d: TRAZADOS.ecuador }));

  // Costa: un trazo ancho y suave bajo la tierra, como las líneas de agua de los grabados
  const todos = TRAZADOS.otros + Object.entries(TRAZADOS.paises)
    .filter(([c]) => c !== 'ES' && c !== 'ES-CN').map(([, d]) => d).join('');
  svg.appendChild(elementoSvg('path', { class: 'mapa__costa', d: todos }));

  // Tierra de otros países (solo contexto)
  svg.appendChild(elementoSvg('path', { class: 'mapa__otros', d: TRAZADOS.otros }));

  // Rótulos de mares y océanos
  for (const r of ROTULOS) {
    const t = elementoSvg('text', { class: 'mapa__rotulo', x: r.x, y: r.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
    if (r.girado) t.setAttribute('transform', `rotate(${r.girado} ${r.x} ${r.y})`);
    t.textContent = r.texto;
    svg.appendChild(t);
  }
  svg.appendChild(crearRosa(36, 438));

  // Recuadro de España y Canarias
  const recuadro = elementoSvg('g', { class: 'mapa__recuadro' });
  recuadro.appendChild(elementoSvg('rect', { class: 'mapa__mar mapa__marco', x: R.x, y: R.y, width: R.ancho, height: R.alto }));
  recuadro.appendChild(elementoSvg('path', { class: 'mapa__otros', d: TRAZADOS.vecinosEspana }));
  recuadro.appendChild(elementoSvg('rect', { class: 'mapa__marco mapa__marco--canarias', x: C.x, y: C.y, width: C.ancho, height: C.alto }));
  svg.appendChild(recuadro);

  // Países del juego (se pueden tocar)
  const dibujarPaises = (trazados, destino) => {
    for (const [codigo, d] of Object.entries(trazados)) {
      if (!LUGARES[codigo]) continue;
      const pais = elementoSvg('path', { class: 'pais', d, 'data-codigo': codigo });
      (siluetas[codigo] ||= []).push(pais);
      destino.appendChild(pais);
    }
  };
  dibujarPaises(TRAZADOS.paises, svg);

  // Recuadro de Centroamérica ampliada, en el Pacífico
  const ampliada = elementoSvg('g', { class: 'mapa__recuadro' });
  ampliada.appendChild(elementoSvg('rect', { class: 'mapa__mar mapa__marco', x: CA.x, y: CA.y, width: CA.ancho, height: CA.alto }));
  ampliada.appendChild(elementoSvg('path', { class: 'mapa__costa', d: TRAZADOS.vecinosCA + Object.values(TRAZADOS.paisesCA).join('') }));
  ampliada.appendChild(elementoSvg('path', { class: 'mapa__otros', d: TRAZADOS.vecinosCA }));
  dibujarPaises(TRAZADOS.paisesCA, ampliada);
  const titulo = elementoSvg('text', { class: 'mapa__rotulo', x: CA.x + 6, y: CA.y + CA.alto - 7 });
  titulo.textContent = 'Centroamérica';
  ampliada.appendChild(titulo);
  svg.appendChild(ampliada);

  // Líneas guía de los países pequeños
  for (const lugar of Object.values(LUGARES)) {
    if (!lugar.ancla) continue;
    const { etiqueta: e, ancla: a } = lugar;
    svg.appendChild(elementoSvg('line', { class: 'mapa__guia', x1: e.x, y1: e.y, x2: a.x, y2: a.y }));
    svg.appendChild(elementoSvg('circle', { class: 'mapa__ancla', cx: a.x, cy: a.y, r: 1.6 }));
  }

  mapa.appendChild(svg);

  // Nombres (botones encima del dibujo)
  for (const [codigo, lugar] of Object.entries(LUGARES)) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'etiqueta' + (lugar.ancla ? ' etiqueta--mar' : '') + (lugar.lado === 'izquierda' ? ' etiqueta--izquierda' : '');
    boton.dataset.codigo = codigo;
    boton.setAttribute('aria-label', lugar.nombre);
    boton.style.left = `${(lugar.etiqueta.x / ANCHO) * 100}%`;
    boton.style.top = `${(lugar.etiqueta.y / ALTO) * 100}%`;

    const nombre = document.createElement('span');
    nombre.className = 'etiqueta__nombre';
    nombre.textContent = lugar.corto || lugar.nombre;
    boton.appendChild(nombre);

    // Al pasar el ratón por el nombre, se resalta también el país
    boton.addEventListener('mouseenter', () => (siluetas[codigo] || []).forEach((p) => p.classList.add('pais--encima')));
    boton.addEventListener('mouseleave', () => (siluetas[codigo] || []).forEach((p) => p.classList.remove('pais--encima')));
    etiquetas[codigo] = boton;
    mapa.appendChild(boton);
  }

  // Bocadillo junto al lugar elegido, para confirmarlo (o para escoger entre
  // varios lugares si el toque cae entre ellos): así se ve aunque se haya
  // ampliado la pantalla con los dedos y la barra de abajo quede fuera de la vista.
  const bocadillo = document.createElement('div');
  bocadillo.id = 'bocadillo';
  bocadillo.className = 'bocadillo';
  bocadillo.hidden = true;
  // Sus botones se rehacen al tocarlos: que ese toque no llegue al mapa.
  bocadillo.addEventListener('click', (e) => e.stopPropagation());
  mapa.appendChild(bocadillo);
  new ResizeObserver(() => { if (!bocadillo.hidden) colocarBocadillo(); }).observe(mapa);

  // El navegador puede mover el clic de un toque hacia el botón más cercano;
  // se guarda dónde cayó de verdad el dedo.
  mapa.addEventListener('pointerdown', (e) => { puntoToque = { x: e.clientX, y: e.clientY }; });
  mapa.addEventListener('click', tocarMapa);
}

/* ---------- Interacción ---------- */

// Cambia el estado de un lugar en el mapa: '', 'elegido', 'fallo' o 'correcto'.
function marcar(codigo, estado) {
  for (const el of [etiquetas[codigo], ...(siluetas[codigo] || [])]) {
    if (!el) continue;
    if (estado) el.dataset.estado = estado;
    else delete el.dataset.estado;
  }
}

function destello(codigo) {
  const nombre = etiquetas[codigo].querySelector('.etiqueta__nombre');
  nombre.classList.remove('destello');
  void nombre.offsetWidth; // reinicia la animación
  nombre.classList.add('destello');
}

// Radio (px) alrededor del dedo en el que se buscan lugares, para que no haga
// falta ampliar la pantalla para acertar con los países pequeños.
const RADIO_TOQUE = 14;
let puntoToque = null;

// Toque en el mapa: si cae sobre un nombre o no hay dudas, se elige ese lugar;
// si cae entre varios, el bocadillo pregunta cuál.
function tocarMapa(evento) {
  if (palabraTerminada || evento.target.closest('.mapa__siguiente')) return;

  // Con el teclado (Intro o espacio sobre un nombre) no hay punto que mirar.
  if (evento.detail === 0) {
    const boton = evento.target.closest('.etiqueta');
    if (boton) elegir(boton.dataset.codigo);
    return;
  }

  const { x, y } = puntoToque || { x: evento.clientX, y: evento.clientY };
  puntoToque = null;
  const candidatos = lugaresCerca(x, y);
  if (candidatos.length === 1) elegir(candidatos[0]);
  else if (candidatos.length > 1) preguntar(candidatos, x, y);
  else if (opciones) cerrarOpciones();
}

// Lugares que se pueden elegir alrededor de un punto de la pantalla, del más
// probable al menos. Un toque de lleno sobre el texto de un nombre no deja dudas.
function lugaresCerca(x, y) {
  const libre = (c) => c && !intentos.some((i) => i.codigo === c);
  const nombreEn = (px, py) => {
    const el = document.elementsFromPoint(px, py).find((e) => e.classList.contains('etiqueta__nombre'));
    return el && libre(el.parentElement.dataset.codigo) ? el.parentElement.dataset.codigo : null;
  };
  const enCentro = document.elementsFromPoint(x, y);
  const nombre = nombreEn(x, y);
  const cerca = [[0, -8], [0, 8], [-8, 0], [8, 0]].map(([dx, dy]) => nombreEn(x + dx, y + dy));
  if (nombre && cerca.every((c) => !c || c === nombre)) return [nombre];

  // Un toque de lleno en un lugar ya probado no elige a su vecino.
  const debajo = enCentro.find((el) => el.matches('.pais, .etiqueta'));
  if (debajo && !libre(debajo.dataset.codigo)) return [];

  // Puntos: 4 por el centro y 1 por cada punto del anillo que toca el lugar.
  const puntos = new Map();
  const sumar = (c, n) => { if (libre(c)) puntos.set(c, (puntos.get(c) || 0) + n); };
  const lugarDe = (el) => (el.classList.contains('pais') ? el.dataset.codigo
    : el.classList.contains('etiqueta__nombre') ? el.parentElement.dataset.codigo : null);

  const vistos = new Set();
  for (const el of enCentro) {
    // La zona de toque del botón (más grande que el texto) solo cuenta en el centro.
    const c = lugarDe(el) || (el.classList.contains('etiqueta') ? el.dataset.codigo : null);
    if (c && !vistos.has(c)) { vistos.add(c); sumar(c, 4); }
  }
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const anillo = new Set(document.elementsFromPoint(x + RADIO_TOQUE * Math.cos(a), y + RADIO_TOQUE * Math.sin(a))
      .map(lugarDe).filter(Boolean));
    for (const c of anillo) sumar(c, 1);
  }

  // Si el dedo está dentro de un país, los vecinos que apenas asoman en el anillo no cuentan.
  const orden = [...puntos.entries()].sort((a, b) => b[1] - a[1]);
  const minimo = orden.length && orden[0][1] >= 4 ? 3 : 1;
  return orden.filter(([, n]) => n >= minimo).slice(0, 3).map(([c]) => c);
}

// Primer toque: se elige el lugar (hay que confirmarlo con el botón).
function elegir(codigo) {
  if (palabraTerminada || intentos.some((i) => i.codigo === codigo)) return;
  quitarCandidatos();
  opciones = null;
  if (seleccion) marcar(seleccion, '');
  seleccion = codigo;
  marcar(codigo, 'elegido');
  destello(codigo);
  mostrarBocadillo();
}

// El toque cae entre varios lugares: se resaltan y el bocadillo pregunta cuál.
function preguntar(candidatos, x, y) {
  if (seleccion) marcar(seleccion, '');
  seleccion = null;
  quitarCandidatos();
  const caja = $('mapa').getBoundingClientRect();
  opciones = { lugares: candidatos, x: (x - caja.left) / caja.width, y: (y - caja.top) / caja.height };
  for (const c of candidatos) etiquetas[c].classList.add('etiqueta--candidata');
  mostrarBocadillo();
}

function cerrarOpciones() {
  opciones = null;
  quitarCandidatos();
  mostrarBocadillo();
}

function quitarCandidatos() {
  for (const e of Object.values(etiquetas)) e.classList.remove('etiqueta--candidata');
}

function mostrarBocadillo() {
  const bocadillo = $('bocadillo');
  bocadillo.hidden = (!seleccion && !opciones) || palabraTerminada;
  if (bocadillo.hidden) return;

  const boton = (texto, accion) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bocadillo__boton';
    b.textContent = texto;
    b.addEventListener('click', accion);
    return b;
  };
  bocadillo.classList.toggle('bocadillo--opciones', !!opciones);
  if (opciones) {
    const pregunta = document.createElement('span');
    pregunta.className = 'bocadillo__pregunta';
    pregunta.textContent = '¿Cuál?';
    bocadillo.replaceChildren(pregunta, ...opciones.lugares.map((c) =>
      boton(LUGARES[c].corto || LUGARES[c].nombre, () => elegir(c))));
  } else {
    bocadillo.replaceChildren(boton(`Elegir ${LUGARES[seleccion].nombre}`, confirmar));
  }
  colocarBocadillo();
}

// Encima del nombre elegido o del punto tocado (o debajo, si arriba no cabe),
// sin salirse del mapa.
function colocarBocadillo() {
  const mapa = $('mapa');
  const bocadillo = $('bocadillo');
  const caja = mapa.getBoundingClientRect();
  let nombre;
  if (opciones) {
    // Un poco por encima y por debajo del dedo, para no taparlo.
    const x = caja.left + opciones.x * caja.width;
    const y = caja.top + opciones.y * caja.height;
    nombre = { left: x, width: 0, top: y - 16, bottom: y + 16 };
  } else {
    nombre = etiquetas[seleccion].querySelector('.etiqueta__nombre').getBoundingClientRect();
  }
  const margen = 6;
  const ancho = bocadillo.offsetWidth;
  const alto = bocadillo.offsetHeight;
  const centro = nombre.left + nombre.width / 2 - caja.left;
  const x = Math.min(Math.max(centro - ancho / 2, margen), mapa.clientWidth - ancho - margen);
  const arriba = nombre.top - caja.top - alto - 10 >= margen;
  const y = arriba ? nombre.top - caja.top - alto - 10 : nombre.bottom - caja.top + 10;
  bocadillo.style.left = `${x}px`;
  bocadillo.style.top = `${y}px`;
  bocadillo.style.setProperty('--pico', `${Math.min(Math.max(centro - x, 14), ancho - 14)}px`);
  bocadillo.classList.toggle('bocadillo--debajo', !arriba);
}

function confirmar() {
  if (palabraTerminada || !seleccion) return;
  const codigo = seleccion;
  seleccion = null;
  marcar(codigo, '');

  intentos.push(evaluar(codigo));
  palabraTerminada = acabada(intentos);
  terminada = palabraTerminada && ronda === dia.length - 1;

  if (terminada) registrarEstadisticas();
  guardarPartida();

  pintar(true);
  if (terminada) {
    avisarAlmanaque();
    setTimeout(() => $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
  } else if (palabraTerminada) {
    $('boton-siguiente').focus({ preventScroll: true });
  }
}

// Pasa a la siguiente palabra del día con el mapa limpio.
function siguiente() {
  if (!palabraTerminada || terminada) return;
  ponerRonda(ronda + 1);
  for (const [codigo, etiqueta] of Object.entries(etiquetas)) {
    const flecha = etiqueta.querySelector('.flecha');
    if (flecha) flecha.remove();
    etiqueta.setAttribute('aria-label', LUGARES[codigo].nombre);
  }
  guardarPartida();
  pintarPalabra();
  pintar(false);
  $('palabra-bloque').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function ponerRonda(r) {
  ronda = r;
  palabra = dia[r];
  intentos = rondas[r];
  palabraTerminada = acabada(intentos);
  seleccion = null;
  opciones = null;
  quitarCandidatos();
}

// Guardar la partida en curso (así, si se recarga, no se puede volver a empezar).
function guardarPartida() {
  datos.partida = { numero, ronda, rondas: rondas.map((l) => l.map((i) => i.codigo)), terminada };
  guardarDatos();
}

/* ---------- Estadísticas ---------- */

function registrarEstadisticas() {
  if (modoPrueba) return;
  const s = datos.stats;
  if (s.ultimoJugado === numero) return; // ya contada
  const aciertos = acertadas();
  s.jugadas += 1;
  s.palabras += dia.length;
  s.acertadas += aciertos;
  // La racha cuenta los días seguidos en que se termina la partida, se acierte o no.
  s.racha = s.ultimoJugado === numero - 1 ? s.racha + 1 : 1;
  s.mejor = Math.max(s.mejor, s.racha);
  s.ultimoJugado = numero;
  if (aciertos === dia.length) {
    s.ganadas += 1;
    s.ultimoGanado = numero;
  }
}

// Palabras del día acertadas.
function acertadas() {
  return rondas.filter((l) => l.some((i) => i.acierto)).length;
}

// La racha (días seguidos jugando) se pierde si ayer no se terminó la partida.
function rachaActual() {
  const s = datos.stats;
  return s.ultimoJugado !== null && s.ultimoJugado >= hoy - 1 ? s.racha : 0;
}

/* ---------- Pintar el estado ---------- */

function pintarPalabra() {
  const cual = dia.length > 1 ? ` · palabra ${ronda + 1} de ${dia.length}` : '';
  $('palabra-numero').textContent = `Atlas · nº ${numero}${cual}`;
  $('palabra-texto').textContent = palabra.palabra;
}

function pintarIntentos() {
  const caja = $('intentos');
  caja.replaceChildren();
  for (let n = 0; n < CONFIG.INTENTOS; n++) {
    const punto = document.createElement('span');
    const i = intentos[n];
    punto.className = 'intento' + (i ? (i.acierto ? ' intento--acierto' : ' intento--fallo') : '');
    if (i && !i.acierto) punto.dataset.temperatura = claveTemperatura(i.temperatura);
    caja.appendChild(punto);
  }
  const quedan = CONFIG.INTENTOS - intentos.length;
  caja.setAttribute('aria-label', palabraTerminada ? 'Palabra terminada' : `Quedan ${quedan} intentos`);

  // Al acabar cada palabra se desvela su significado.
  const significado = $('palabra-significado');
  significado.textContent = palabra.significado ? `«${palabra.significado}»` : '';
  significado.hidden = !palabraTerminada || !palabra.significado;
}

function pintarMapa(animar) {
  for (const [codigo, etiqueta] of Object.entries(etiquetas)) {
    const intento = intentos.find((i) => i.codigo === codigo);
    const correcta = palabra.lugares.includes(codigo);
    let estado = '';
    if (correcta && (palabraTerminada || intento)) estado = 'correcto';
    else if (intento) estado = 'fallo';
    else if (codigo === seleccion) estado = 'elegido';
    marcar(codigo, estado);
    etiqueta.disabled = palabraTerminada || !!intento;

    // Flecha de pista junto al nombre de los lugares fallados
    if (intento && !intento.acierto && !etiqueta.querySelector('.flecha')) {
      const flecha = crearFlecha(intento.rumbo, intento.temperatura);
      if (!animar) flecha.style.animation = 'none';
      etiqueta.appendChild(flecha);
      etiqueta.setAttribute('aria-label', `${LUGARES[codigo].nombre}: ${intento.temperatura}, hacia el ${nombreRumbo(intento.rumbo)}`);
    }
  }
  $('mapa').classList.toggle('mapa--terminado', palabraTerminada);
  mostrarBocadillo();
}

// Giro acumulado de la flecha de la brújula, para que gire por el camino más corto.
let giroBrujula = null;

function pintarPista(animar) {
  const pista = $('pista');
  const tarjeta = $('pista-tarjeta');
  const ultimo = intentos[intentos.length - 1];
  const fallos = intentos.filter((i) => !i.acierto).length;

  // La región se desvela tras el segundo fallo.
  const region = $('palabra-region');
  if (fallos >= 2 && !palabraTerminada) {
    region.textContent = `Pista: ${palabra.region}`;
    region.hidden = false;
  } else {
    region.hidden = true;
  }

  $('barra').hidden = terminada;
  $('boton-siguiente').hidden = !palabraTerminada || terminada;
  if (terminada) return;

  pista.replaceChildren();
  const conTarjeta = !palabraTerminada && !!ultimo;
  pista.hidden = conTarjeta;
  tarjeta.hidden = !conTarjeta;
  if (!conTarjeta) {
    // Al ocultarse, la brújula vuelve al norte para que la próxima flecha gire desde ahí.
    giroBrujula = null;
    $('pista-flecha').style.transition = 'none';
    $('pista-flecha').style.transform = 'rotate(0deg)';
  }

  // Palabra acabada (y quedan más): solución (el botón para seguir sale en el mapa).
  if (palabraTerminada) {
    const veredicto = document.createElement('strong');
    veredicto.textContent = ultimo.acierto ? `¡Acertaste ${ORDINALES[intentos.length - 1]}!` : 'No ha podido ser.';
    pista.append(veredicto, ` Se dice en ${listaConY(nombresLugares(palabra))}.`);
    return;
  }

  if (!ultimo) {
    pista.textContent = 'Toca en el mapa un lugar donde se diga esta palabra.';
    return;
  }
  pintarTarjetaPista(ultimo, intentos[intentos.length - 2], animar);
}

// Tarjeta tras un fallo: brújula hacia el lugar correcto más cercano, temperatura
// con termómetro y, desde el segundo fallo, si te acercas o te alejas.
function pintarTarjetaPista(ultimo, anterior, animar) {
  const tarjeta = $('pista-tarjeta');
  tarjeta.dataset.temperatura = claveTemperatura(ultimo.temperatura);

  // La flecha gira desde donde estaba por el camino más corto.
  const flecha = $('pista-flecha');
  const nuevo = giroBrujula === null ? 0 : giroBrujula;
  giroBrujula = nuevo + ((((ultimo.rumbo - nuevo) % 360) + 540) % 360) - 180;
  flecha.style.transition = animar ? '' : 'none';
  if (animar) void flecha.getBoundingClientRect(); // fija el giro de partida antes de girar
  flecha.style.transform = `rotate(${Math.round(giroBrujula)}deg)`;

  $('pista-temperatura').textContent = ultimo.temperatura;
  $('pista-rumbo').textContent = `Prueba hacia el ${nombreRumbo(ultimo.rumbo)}`;

  const lugar = LUGARES[ultimo.codigo].nombre;
  let detalle = `Desde ${lugar}`;
  if (anterior && !anterior.acierto) {
    const diferencia = ultimo.km - anterior.km;
    if (diferencia < -CONFIG.MARGEN_KM) detalle += ' · 🔥 te acercas';
    else if (diferencia > CONFIG.MARGEN_KM) detalle += ' · ❄️ te alejas';
    else detalle += ' · igual de lejos';
  }
  $('pista-detalle').textContent = detalle;

  if (animar) {
    tarjeta.classList.remove('pista--nueva');
    void tarjeta.offsetWidth; // reinicia la animación
    tarjeta.classList.add('pista--nueva');
  }
}

const ORDINALES = ['a la primera', 'al segundo intento', 'al tercer intento'];
const CUANTAS = ['ninguna', 'una', 'dos', 'tres', 'cuatro', 'cinco'];

function listaConY(nombres) {
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}` : nombres[0] || '';
}

function nombresLugares(p) {
  return p.lugares.filter((c) => LUGARES[c]).map((c) => LUGARES[c].nombre);
}

function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

// Tarjeta del resultado con la solución de una palabra. A la vista quedan la
// palabra, su significado y dónde se dice; los equivalentes y la curiosidad se
// despliegan al tocar la palabra.
function tarjetaPalabra(p, lista) {
  const ultimo = lista[lista.length - 1];
  const acierto = !!(ultimo && ultimo.acierto);
  const cabecera = [];
  if (dia.length > 1) {
    cabecera.push(crear('p', 'resultado__veredicto' + (acierto ? ' resultado__veredicto--acierto' : ''),
      acierto ? `Acertada ${ORDINALES[lista.length - 1]}` : 'No acertada'));
    cabecera.push(crear('h3', 'resultado__texto', p.palabra));
  }
  // El significado no se muestra durante la partida: se desvela aquí.
  const significado = p.significado ? ` significa «${p.significado}» y` : '';
  cabecera.push(crear('p', 'resultado__lugares', `«${p.palabra}»${significado} se dice en ${listaConY(nombresLugares(p))}.`));

  const mas = [];
  const equivalentes = Object.entries(p.equivalentes || {});
  if (equivalentes.length) {
    mas.push(crear('h4', 'subtitulo', 'Y en otros sitios se dice…'));
    const dl = crear('dl', 'equivalentes');
    for (const [lugar, dicho] of equivalentes) dl.append(crear('dt', '', lugar), crear('dd', '', dicho));
    mas.push(dl);
  }

  if (p.curiosidad) {
    mas.push(crear('h4', 'subtitulo', 'Curiosidad'));
    mas.push(crear('p', 'curiosidad', p.curiosidad));
  }

  // Sin nada más que contar, la tarjeta no se despliega.
  if (!mas.length) {
    const tarjeta = crear('div', 'tarjeta resultado__palabra');
    tarjeta.append(...cabecera);
    return tarjeta;
  }

  const tarjeta = crear('details', 'tarjeta resultado__palabra');
  const resumen = crear('summary', 'resultado__resumen');
  resumen.append(...cabecera, crear('span', 'resultado__mas', 'Saber más'));
  tarjeta.append(resumen, ...mas);
  return tarjeta;
}

function pintarResultado() {
  const caja = $('resultado');
  caja.hidden = !terminada;
  if (!terminada) return;

  const aciertos = acertadas();
  let titulo;
  if (dia.length === 1) {
    titulo = aciertos ? `¡Acertaste ${ORDINALES[intentos.length - 1]}!` : 'Esta vez no ha podido ser';
  } else if (aciertos === dia.length) {
    titulo = `¡Acertaste las ${CUANTAS[aciertos] || aciertos}!`;
  } else if (aciertos === 0) {
    titulo = 'Esta vez no ha podido ser';
  } else {
    titulo = `Acertaste ${CUANTAS[aciertos] || aciertos} de ${CUANTAS[dia.length] || dia.length}`;
  }
  $('resultado-titulo').textContent = titulo;

  $('resultado-palabras').replaceChildren(...dia.map((p, i) => tarjetaPalabra(p, rondas[i])));

  // Estadísticas
  const s = datos.stats;
  const cifras = [
    [s.jugadas, 'Jugadas'],
    [s.palabras ? Math.round((s.acertadas / s.palabras) * 100) + '%' : '0%', 'Aciertos'],
    [rachaActual(), 'Racha actual'],
    [s.mejor, 'Mejor racha'],
  ];
  const stats = $('estadisticas');
  stats.replaceChildren();
  for (const [valor, nombre] of cifras) {
    const div = document.createElement('div');
    const n = document.createElement('span');
    n.className = 'estadistica__numero';
    n.textContent = valor;
    const t = document.createElement('span');
    t.className = 'estadistica__nombre';
    t.textContent = nombre;
    div.append(n, t);
    stats.appendChild(div);
  }

  iniciarCuentaAtras();
}

function pintar(animar = false) {
  pintarIntentos();
  pintarMapa(animar);
  pintarPista(animar);
  pintarResultado();
}

/* ---------- Compartir ---------- */

const CUADROS = { frio: '🟦', templado: '🟧', caliente: '🟥' };

function textoCompartir() {
  const lineas = rondas.map((lista) => {
    const cuadros = lista.map((i) => (i.acierto ? '🟩' : CUADROS[claveTemperatura(i.temperatura)])).join('');
    const acierto = lista.some((i) => i.acierto);
    return `${cuadros}  ${acierto ? lista.length : 'X'}/${CONFIG.INTENTOS}`;
  });
  return `Atlas #${numero} 🗺️\n${lineas.join('\n')}\nRacha: ${rachaActual()}`;
}

async function compartir() {
  const texto = textoCompartir();
  const aviso = $('copiado');
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ text: texto }); return; } catch (e) {
      if (e && e.name === 'AbortError') return; // el jugador canceló
    }
  }
  try {
    await navigator.clipboard.writeText(texto);
    aviso.textContent = 'Resultado copiado. ¡Pégalo donde quieras!';
  } catch (e) {
    aviso.textContent = 'No se ha podido copiar el resultado.';
  }
  setTimeout(() => { aviso.textContent = ''; }, 3000);
}

/* ---------- Cuenta atrás ---------- */

function iniciarCuentaAtras() {
  if (temporizador) return;
  const fechaInicial = fechaMadrid();
  const dos = (n) => String(n).padStart(2, '0');
  const tic = () => {
    // Nuevo día: se recarga para mostrar las palabras siguientes.
    if (!modoPrueba && fechaMadrid() !== fechaInicial) { location.reload(); return; }
    const s = segundosHastaMedianoche();
    $('cuenta-atras').textContent = `${dos(Math.floor(s / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`;
  };
  tic();
  temporizador = setInterval(tic, 1000);
}

/* ---------- Ayuda ---------- */

function abrirAyuda() {
  const dialogo = $('ayuda');
  if (typeof dialogo.showModal === 'function') dialogo.showModal();
  else dialogo.setAttribute('open', '');
}

function prepararAyuda() {
  $('boton-ayuda').addEventListener('click', abrirAyuda);
  $('ayuda').addEventListener('close', () => {
    if (!datos.ayudaVista) { datos.ayudaVista = true; guardarDatos(); }
  });
  // Cerrar tocando fuera del cuadro
  $('ayuda').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
}

/* ---------- Portada ---------- */

// La portada con el logo se ve al menos PORTADA_MS desde que se abre la página
// y luego se desvanece. La primera vez, al irse, se abre la ayuda.
const PORTADA_MS = 1200;
const FUNDIDO_MS = 450;

function retirarPortada() {
  const portada = $('portada');
  setTimeout(() => {
    portada.classList.add('portada--fuera');
    setTimeout(() => {
      portada.remove();
      if (!datos.ayudaVista && !modoPrueba && palabra) abrirAyuda();
    }, FUNDIDO_MS);
  }, Math.max(0, PORTADA_MS - performance.now()));
}

/* ---------- Almanaque ---------- */

// Avisa a Almanaque de que la partida de hoy está hecha, con los aciertos y la racha
// para la hoja de Atlas.
function avisarAlmanaque() {
  if (modoPrueba) return;
  const avisar = () => window.almanaqueHecho?.({
    aciertos: acertadas(),
    total: dia.length,
    racha: rachaActual(),
  });
  // Este script corre antes que volver-almanaque.js (que lleva defer): si aún no existe,
  // se espera a DOMContentLoaded, que llega después de los scripts con defer.
  if (window.almanaqueHecho) avisar();
  else document.addEventListener('DOMContentLoaded', avisar, { once: true });
}

/* ---------- Arranque ---------- */

async function iniciar() {
  $('boton-siguiente').addEventListener('click', siguiente);
  $('boton-compartir').addEventListener('click', compartir);
  prepararAyuda();

  let dias;
  try {
    const respuesta = await fetch('palabras.json', { cache: 'no-cache' });
    const lista = await respuesta.json();
    // Cada día es una lista de palabras (una entrada suelta cuenta como un día de una palabra).
    dias = (Array.isArray(lista) ? lista : []).map((d) => (Array.isArray(d) ? d : [d])).filter((d) => d.length);
    if (dias.length === 0) throw new Error('Lista vacía');
  } catch (e) {
    $('palabra-texto').textContent = 'Vaya…';
    $('palabra-error').textContent = 'No se han podido cargar las palabras. Prueba a recargar la página.';
    $('palabra-error').hidden = false;
    $('barra').hidden = true;
    retirarPortada();
    return;
  }

  dia = dias[(numero - 1) % dias.length];
  rondas = dia.map(() => []);
  let r = 0;

  const p = datos.partida;
  if (modoPrueba) {
    const aviso = $('aviso-prueba');
    aviso.textContent = `Modo de prueba: día ${numero} (${dia.map((x) => `«${x.palabra}»`).join(', ')}). No se guarda nada.`;
    aviso.hidden = false;
  } else if (p && p.numero === numero && Array.isArray(p.rondas)) {
    // Partida de hoy ya empezada o terminada: se recupera.
    rondas = dia.map((x, i) => (p.rondas[i] || []).filter((c) => LUGARES[c]).map((c) => evaluar(c, x)));
    r = Math.min(Math.max(0, Number(p.ronda) || 0), dia.length - 1);
    terminada = rondas.every(acabada);
    if (terminada) r = dia.length - 1;
  } else {
    datos.partida = null;
  }
  ponerRonda(r);

  dibujarMapa();
  pintarPalabra();
  pintar(false);
  if (terminada) avisarAlmanaque();
  retirarPortada();
}

iniciar();

// Service worker para jugar sin conexión (solo funciona servido por http/https).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo sin conexión */ });
  });
}
