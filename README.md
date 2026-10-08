# Atlas

Juego diario de palabras del español. Cada día aparecen tres palabras que solo se usan
en algunos lugares del mundo hispanohablante y, una tras otra, hay que tocar en el
mapa un lugar donde se diga cada una. Tres intentos por palabra, con pistas de
distancia, dirección y región. Forma parte de la colección de [Almanaque](https://joseleking.github.io/Almanaque/).

Es una web estática (HTML, CSS y JavaScript, sin frameworks ni compilación), lista
para GitHub Pages e instalable como aplicación (PWA).

## Archivos

| Archivo | Contenido |
| --- | --- |
| `index.html` | Estructura de la página y ayuda |
| `estilos.css` | Estética de papel antiguo y tinta |
| `juego.js` | Lógica: palabras del día, pistas, resultado, estadísticas, compartir, cuenta atrás |
| `mapa.js` | Lugares del mapa: nombre, región, coordenadas y dónde se escribe cada nombre |
| `mapa-trazados.js` | Contornos de los países ya dibujados (generado, no se edita a mano) |
| `herramientas/generar-trazados.mjs` | Script que genera `mapa-trazados.js` (solo para cambiar el encuadre) |
| `palabras.json` | Las palabras, agrupadas por días, en orden |
| `manifest.json`, `sw.js` | Instalación como aplicación y uso sin conexión |
| `reiniciar/index.html` | Página para borrar el progreso guardado |
| `volver-almanaque.js` | Enlace de vuelta a Almanaque (copia de `Almanaque/para-los-juegos/`) |
| `icons/` | Logo (SVG con la A en trazado) e iconos PNG de 32, 180, 192 y 512 px |

## Añadir palabras

Edita solo `palabras.json`. Es una lista de días, y cada día es una lista con sus
tres palabras:

```json
[
  [ { …palabra 1… }, { …palabra 2… }, { …palabra 3… } ],
  [ … ]
]
```

Cada palabra:

```json
{
  "palabra": "guagua",
  "significado": "autobús",
  "lugares": ["ES-CN", "CU", "PR", "DO"],
  "region": "Caribe",
  "equivalentes": { "España": "autobús", "México": "camión" },
  "curiosidad": "En Chile y Ecuador, «guagua» no es un autobús, sino un bebé."
}
```

- `lugares` usa estos códigos: `ES`, `ES-CN`, `MX`, `GT`, `SV`, `HN`, `NI`, `CR`, `PA`,
  `CU`, `DO`, `PR`, `CO`, `VE`, `EC`, `PE`, `BO`, `CL`, `AR`, `UY`, `PY`.
- `region` es el texto de la pista tras el segundo fallo.
- Si en algunos lugares la palabra significa otra cosa, se añade
  `"otrosSignificados": [{ "lugares": ["ES"], "significado": "…" }]`. Esos lugares
  también van en `lugares` (todos cuentan como acierto) y `significado` queda para
  los demás.
- `equivalentes` puede quedar vacío (`{}`): entonces no se muestra esa parte.
- Los días se recorren en orden desde `FECHA_INICIO` (en `juego.js`) y, al acabarse,
  se vuelve a empezar. Hay 70 días: el último es el 10 de diciembre de 2026 y el 11
  vuelve el día 1. Añade los nuevos **al final** para no cambiar los ya jugados.
  El primer día (`guagua`) es de cuando Atlas tenía una sola palabra; el juego admite
  días con cualquier número de palabras.
- La racha cuenta los días seguidos en que se termina la partida, se acierte o no,
  y se pierde al saltarse un día. «Aciertos» es el porcentaje de palabras acertadas.

## El mapa

Es un mapa real de las Américas (proyección acimutal de Lambert) con España y
Canarias en un recuadro arriba a la derecha. Los contornos vienen de
[Natural Earth](https://www.naturalearthdata.com/) 1:50m (dominio público), ya
proyectados y simplificados en `mapa-trazados.js`, así que el juego no usa ninguna
librería. Para mover un nombre, cambia su `etiqueta` (y su `ancla`, si tiene línea
guía) en `mapa.js`. Solo hace falta regenerar los trazados para cambiar el encuadre;
las instrucciones están al principio de `herramientas/generar-trazados.mjs`.

## Probar en local

`juego.js` carga `palabras.json` con `fetch`, así que hace falta un servidor:

```sh
python3 -m http.server 8000
```

y abre <http://localhost:8000>.

- **Modo de prueba:** <http://localhost:8000/?dia=3> carga las palabras del día 3 sin guardar
  nada ni tocar las estadísticas.
- **Reiniciar el juego:** visita `/reiniciar/` (por ejemplo
  <http://localhost:8000/reiniciar/>) y pulsa «Borrar mi progreso». Borra la partida
  de hoy, la racha y las estadísticas de ese navegador (la clave `atlas:v1` del
  `localStorage`) y te devuelve al juego, que vuelve a mostrar la ayuda inicial.

## Publicar en GitHub Pages

Sube el repositorio a GitHub y, en *Settings → Pages*, elige *Deploy from a branch*,
rama `main` y carpeta `/ (root)`. Quedará en `https://joseleking.github.io/Atlas/`.

Si cambias la lista de archivos de `sw.js`, sube su `VERSION` (`atlas-v2`…).
