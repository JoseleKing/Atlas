/* Atlas · juego.js
   Lógica del juego: palabra del día, intentos y pistas, resultado, estadísticas,
   compartir y cuenta atrás.

   Para añadir palabras basta con editar palabras.json: se recorren en orden,
   una por día a partir de FECHA_INICIO, y al acabarse se vuelve a empezar.

   Modo de prueba: añade ?dia=N a la dirección (por ejemplo index.html?dia=3)
   para jugar la palabra N sin guardar nada. */

'use strict';

/* ---------- Configuración ---------- */

const CONFIG = {
  FECHA_INICIO: '2026-10-02',  // día de la palabra #1 (hora de Madrid), en formato AAAA-MM-DD
  ZONA_HORARIA: 'Europe/Madrid',
  INTENTOS: 3,
  CALIENTE_KM: 1500,           // por debajo: «Caliente»
  TEMPLADO_KM: 4000,           // por debajo: «Templado»; por encima: «Frío»
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

// Número de la palabra de hoy: 1 el día de inicio, 2 el siguiente…
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
    partida: null, // { numero, intentos: [códigos de lugar], terminada }
    stats: { jugadas: 0, ganadas: 0, racha: 0, mejor: 0, ultimoGanado: null, ultimoJugado: null },
  };
}

function cargarDatos() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CONFIG.CLAVE));
    if (guardado && typeof guardado === 'object') {
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
let palabra = null;      // entrada de palabras.json
let intentos = [];       // [{ codigo, acierto, km, rumbo, temperatura }]
let terminada = false;
let seleccion = null;    // código del lugar elegido y aún no confirmado
let temporizador = null;

const $ = (id) => document.getElementById(id);
const etiquetas = {};    // código → botón con el nombre en el mapa
const siluetas = {};     // código → contorno del país en el mapa

/* ---------- Evaluar un intento ---------- */

function evaluar(codigo) {
  if (palabra.lugares.includes(codigo)) return { codigo, acierto: true };

  // Lugar correcto más cercano al que se ha tocado.
  const origen = LUGARES[codigo];
  let cercano = null;
  let km = Infinity;
  for (const destino of palabra.lugares) {
    if (!LUGARES[destino]) continue;
    const d = distanciaKm(origen, LUGARES[destino]);
    if (d < km) { km = d; cercano = destino; }
  }
  const temperatura = km < CONFIG.CALIENTE_KM ? 'caliente' : km < CONFIG.TEMPLADO_KM ? 'templado' : 'frío';
  return { codigo, acierto: false, km, rumbo: rumbo(origen, LUGARES[cercano]), temperatura };
}

/* ---------- Dibujo del mapa ---------- */

const SVG = 'http://www.w3.org/2000/svg';

function elementoSvg(etiqueta, atributos = {}) {
  const el = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
  return el;
}

// Flecha que apunta hacia arriba; se gira según el rumbo.
function crearFlecha(grados) {
  const svg = elementoSvg('svg', { viewBox: '0 0 20 20', class: 'flecha', 'aria-hidden': 'true' });
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
  const { ANCHO, ALTO, RECUADRO: R, CAJA_CANARIAS: C } = TRAZADOS;
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
  for (const [codigo, d] of Object.entries(TRAZADOS.paises)) {
    if (!LUGARES[codigo]) continue;
    const pais = elementoSvg('path', { class: 'pais', d, 'data-codigo': codigo });
    pais.addEventListener('click', () => elegir(codigo));
    siluetas[codigo] = pais;
    svg.appendChild(pais);
  }

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

    boton.addEventListener('click', () => elegir(codigo));
    // Al pasar el ratón por el nombre, se resalta también el país
    boton.addEventListener('mouseenter', () => siluetas[codigo] && siluetas[codigo].classList.add('pais--encima'));
    boton.addEventListener('mouseleave', () => siluetas[codigo] && siluetas[codigo].classList.remove('pais--encima'));
    etiquetas[codigo] = boton;
    mapa.appendChild(boton);
  }
}

/* ---------- Interacción ---------- */

// Cambia el estado de un lugar en el mapa: '', 'elegido', 'fallo' o 'correcto'.
function marcar(codigo, estado) {
  for (const el of [etiquetas[codigo], siluetas[codigo]]) {
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

// Primer toque: se elige el lugar (hay que confirmarlo con el botón).
function elegir(codigo) {
  if (terminada || intentos.some((i) => i.codigo === codigo)) return;
  if (seleccion) marcar(seleccion, '');
  seleccion = codigo;
  marcar(codigo, 'elegido');
  destello(codigo);
  const boton = $('boton-elegir');
  boton.disabled = false;
  boton.textContent = `Elegir ${LUGARES[codigo].nombre}`;
}

function confirmar() {
  if (!seleccion || terminada) return;
  const codigo = seleccion;
  seleccion = null;
  marcar(codigo, '');

  const intento = evaluar(codigo);
  intentos.push(intento);
  if (intento.acierto || intentos.length >= CONFIG.INTENTOS) terminada = true;

  // Guardar la partida en curso (así, si se recarga, no se puede volver a empezar).
  datos.partida = { numero, intentos: intentos.map((i) => i.codigo), terminada };
  if (terminada) registrarEstadisticas(intento.acierto);
  guardarDatos();

  pintar(true);
  if (terminada) {
    avisarAlmanaque();
    setTimeout(() => $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
  }
}

/* ---------- Estadísticas ---------- */

function registrarEstadisticas(acierto) {
  if (modoPrueba) return;
  const s = datos.stats;
  if (s.ultimoJugado === numero) return; // ya contada
  s.jugadas += 1;
  s.ultimoJugado = numero;
  if (acierto) {
    s.ganadas += 1;
    s.racha = s.ultimoGanado === numero - 1 ? s.racha + 1 : 1;
    s.ultimoGanado = numero;
    s.mejor = Math.max(s.mejor, s.racha);
  } else {
    s.racha = 0;
  }
}

// La racha se pierde si ayer no se acertó.
function rachaActual() {
  const s = datos.stats;
  return s.ultimoGanado !== null && s.ultimoGanado >= hoy - 1 ? s.racha : 0;
}

/* ---------- Pintar el estado ---------- */

function pintarPalabra() {
  $('palabra-numero').textContent = `Atlas · nº ${numero}`;
  $('palabra-texto').textContent = palabra.palabra;
}

function pintarIntentos() {
  const caja = $('intentos');
  caja.replaceChildren();
  for (let n = 0; n < CONFIG.INTENTOS; n++) {
    const punto = document.createElement('span');
    const i = intentos[n];
    punto.className = 'intento' + (i ? (i.acierto ? ' intento--acierto' : ' intento--fallo') : '');
    caja.appendChild(punto);
  }
  const quedan = CONFIG.INTENTOS - intentos.length;
  caja.setAttribute('aria-label', terminada ? 'Partida terminada' : `Quedan ${quedan} intentos`);
}

function pintarMapa(animar) {
  for (const [codigo, etiqueta] of Object.entries(etiquetas)) {
    const intento = intentos.find((i) => i.codigo === codigo);
    const correcta = palabra.lugares.includes(codigo);
    let estado = '';
    if (correcta && (terminada || intento)) estado = 'correcto';
    else if (intento) estado = 'fallo';
    else if (codigo === seleccion) estado = 'elegido';
    marcar(codigo, estado);
    etiqueta.disabled = terminada || !!intento;

    // Flecha de pista junto al nombre de los lugares fallados
    if (intento && !intento.acierto && !etiqueta.querySelector('.flecha')) {
      const flecha = crearFlecha(intento.rumbo);
      if (!animar) flecha.style.animation = 'none';
      etiqueta.appendChild(flecha);
      etiqueta.setAttribute('aria-label', `${LUGARES[codigo].nombre}: ${intento.temperatura}, hacia el ${nombreRumbo(intento.rumbo)}`);
    }
  }
  $('mapa').classList.toggle('mapa--terminado', terminada);
}

function pintarPista() {
  const pista = $('pista');
  const boton = $('boton-elegir');
  const ultimo = intentos[intentos.length - 1];
  const fallos = intentos.filter((i) => !i.acierto).length;

  // La región se desvela tras el segundo fallo.
  const region = $('palabra-region');
  if (fallos >= 2 && !terminada) {
    region.textContent = `Pista: ${palabra.region}`;
    region.hidden = false;
  } else {
    region.hidden = true;
  }

  $('barra').hidden = terminada;
  if (terminada) return;

  boton.disabled = !seleccion;
  if (!seleccion) boton.textContent = 'Elige un lugar';

  pista.replaceChildren();
  if (!ultimo) {
    pista.textContent = 'Toca en el mapa un lugar donde se diga esta palabra.';
    return;
  }
  // «México: frío. → Más cerca hacia el sureste.»
  const temperatura = document.createElement('strong');
  temperatura.textContent = ultimo.temperatura[0].toUpperCase() + ultimo.temperatura.slice(1);
  pista.append(`${LUGARES[ultimo.codigo].nombre}: `, temperatura, '. ', crearFlecha(ultimo.rumbo),
    ` Prueba hacia el ${nombreRumbo(ultimo.rumbo)}.`);
}

function listaConY(nombres) {
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}` : nombres[0] || '';
}

function pintarResultado() {
  const caja = $('resultado');
  caja.hidden = !terminada;
  if (!terminada) return;

  const ultimo = intentos[intentos.length - 1];
  const ordinales = ['a la primera', 'al segundo intento', 'al tercer intento'];
  $('resultado-titulo').textContent = ultimo.acierto
    ? `¡Acertaste ${ordinales[intentos.length - 1] || ''}!`
    : 'Esta vez no ha podido ser';

  const nombres = palabra.lugares.filter((c) => LUGARES[c]).map((c) => LUGARES[c].nombre);
  // El significado no se muestra durante la partida: se desvela aquí.
  const significado = palabra.significado ? ` significa «${palabra.significado}» y` : '';
  $('resultado-lugares').textContent = `«${palabra.palabra}»${significado} se dice en ${listaConY(nombres)}.`;

  // Equivalentes
  const dl = $('equivalentes');
  dl.replaceChildren();
  const equivalentes = Object.entries(palabra.equivalentes || {});
  for (const [lugar, dicho] of equivalentes) {
    const dt = document.createElement('dt');
    dt.textContent = lugar;
    const dd = document.createElement('dd');
    dd.textContent = dicho;
    dl.append(dt, dd);
  }
  dl.closest('.tarjeta').hidden = equivalentes.length === 0;

  // Curiosidad
  $('curiosidad').textContent = palabra.curiosidad || '';
  $('curiosidad').closest('.tarjeta').hidden = !palabra.curiosidad;

  // Estadísticas
  const s = datos.stats;
  const cifras = [
    [s.jugadas, 'Jugadas'],
    [s.jugadas ? Math.round((s.ganadas / s.jugadas) * 100) + '%' : '0%', 'Aciertos'],
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
  pintarPista();
  pintarResultado();
}

/* ---------- Compartir ---------- */

function textoCompartir() {
  const cuadros = intentos.map((i) => (i.acierto ? '🟩' : i.temperatura === 'frío' ? '🟥' : '🟧')).join('');
  const acierto = intentos.some((i) => i.acierto);
  return `Atlas #${numero} 🗺️\n${cuadros}  ${acierto ? intentos.length : 'X'}/${CONFIG.INTENTOS}\nRacha: ${rachaActual()}`;
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
    // Nuevo día: se recarga para mostrar la palabra siguiente.
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

// Avisa a Almanaque (si se llegó desde allí) de que la partida de hoy está hecha.
function avisarAlmanaque() {
  if (!modoPrueba && window.almanaqueHecho) window.almanaqueHecho();
}

/* ---------- Arranque ---------- */

async function iniciar() {
  $('boton-elegir').addEventListener('click', confirmar);
  $('boton-compartir').addEventListener('click', compartir);
  prepararAyuda();

  let palabras;
  try {
    const respuesta = await fetch('palabras.json', { cache: 'no-cache' });
    palabras = await respuesta.json();
    if (!Array.isArray(palabras) || palabras.length === 0) throw new Error('Lista vacía');
  } catch (e) {
    $('palabra-texto').textContent = 'Vaya…';
    $('palabra-error').textContent = 'No se han podido cargar las palabras. Prueba a recargar la página.';
    $('palabra-error').hidden = false;
    $('barra').hidden = true;
    retirarPortada();
    return;
  }

  palabra = palabras[(numero - 1) % palabras.length];

  if (modoPrueba) {
    const aviso = $('aviso-prueba');
    aviso.textContent = `Modo de prueba: palabra ${numero} («${palabra.palabra}»). No se guarda nada.`;
    aviso.hidden = false;
  } else if (datos.partida && datos.partida.numero === numero) {
    // Partida de hoy ya empezada o terminada: se recupera.
    intentos = datos.partida.intentos.filter((c) => LUGARES[c]).map(evaluar);
    terminada = intentos.some((i) => i.acierto) || intentos.length >= CONFIG.INTENTOS;
  } else {
    datos.partida = null;
  }

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
