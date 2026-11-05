# Rendimiento

[English](../performance.md)

Generado por `pnpm bench --write` y `pnpm acceptance`; los objetivos y la máquina de referencia están
en la decisión 0032 y en [quality.md](../quality.md). Cada caso se ejecuta después de unas cuantas
ejecuciones que no se miden; del editor se mide el análisis que recibe un archivo tras una edición
(compilación, disposición y diagnósticos dentro de su proyecto) y un arrastre en el lienzo, desde el
mensaje hasta el nuevo dibujo.

Medido el 2026-10-28: 11th Gen Intel(R) Core(TM) i9-11980HK @ 2.60GHz, 16 hilos, 64 GB, win32 10.0.26300, Node v24.15.0.

| Caso                                                                                 | Mediana (ms) | p95 (ms) | Objetivo (p95, ms) |
| ------------------------------------------------------------------------------------ | -----------: | -------: | ------------------ |
| análisis sintáctico de acceptance/free/sketch.meltemi (118 líneas)                   |         0,21 |     0,43 |                    |
| compilación de acceptance/free/sketch.meltemi                                        |         0,52 |     1,33 |                    |
| compilación de un diagrama de 30 nodos (155 líneas)                                  |         1,07 |     2,98 |                    |
| planificar un arrastre, aplicarlo y recompilar, 30 nodos                             |         1,43 |     5,03 |                    |
| análisis sintáctico de un diagrama de 500 nodos (2505 líneas)                        |         8,80 |    23,93 |                    |
| compilación de un diagrama de 500 nodos (2505 líneas)                                |        17,86 |    33,51 |                    |
| exportación de un diagrama de 30 nodos con las fuentes incluidas                     |         3,35 |     7,56 |                    |
| exportación de un diagrama de 30 nodos con una biblioteca de fuentes nueva (en frío) |        79,07 |    91,37 |                    |
| exportación de un diagrama de 500 nodos con las fuentes incluidas                    |        95,85 |   136,51 |                    |
| organización con ELK y exportación de un diagrama `auto` de 30 nodos                 |        18,49 |    24,89 |                    |
| organización con ELK y exportación de un diagrama `auto` de 500 nodos                |       360,22 |   429,06 |                    |
| análisis tras una edición, flow (auto)                                               |        60,68 |    81,93 | menos de 500       |
| ida y vuelta de un arrastre en el lienzo, flow (auto)                                |        14,59 |    16,49 | menos de 100       |
| análisis tras una edición, sequence (30 elementos)                                   |         2,01 |     8,62 | menos de 500       |
| ida y vuelta de un arrastre en el lienzo, sequence (30 elementos)                    |         5,44 |    11,66 | menos de 100       |
| análisis tras una edición, c4 (30 elementos)                                         |        20,60 |    29,88 | menos de 500       |
| ida y vuelta de un arrastre en el lienzo, c4 (30 elementos)                          |         9,23 |    13,63 | menos de 100       |
| análisis tras una edición, free (30 elementos)                                       |         3,11 |     7,18 | menos de 500       |
| ida y vuelta de un arrastre en el lienzo, free (30 elementos)                        |         5,87 |    11,83 | menos de 100       |
| análisis tras una edición, flow (assisted)                                           |         7,09 |    14,04 | menos de 500       |
| ida y vuelta de un arrastre en el lienzo, flow (assisted)                            |        11,09 |    17,87 | menos de 100       |

## El renderizador del servicio

Medido el 2026-11-04 en la misma máquina, para el cambio `agent-mcp` (tareas 3.1 y 3.3). El objeto
renderizador (`ProjectRenderer`, un Durable Object del Worker del servicio) dibuja vistas previas
con el motor de la línea de órdenes. Sus tamaños salen de `wrangler deploy --dry-run`, su arranque
de `wrangler check startup` (la mediana de cinco ejecuciones) y sus tiempos de la orden de abajo,
que ejecuta el objeto bajo `wrangler dev` tres veces (cada arranque, un aislado en frío) y cada caso
quince veces por arranque. Un tiempo es el tiempo de reloj de una petición en el portátil: dibujar
es trabajo síncrono en un aislado, así que su tiempo de CPU es como mucho ese tiempo, menos el coste
de una petición (las filas `ping` y `stats`). El diagrama más costoso del corpus es `flow/thirty`
(treinta elementos que organiza ELK, 4679 × 973); el PNG más costoso es `sequence/thirty` a 2048,
ajustado al presupuesto de 4 megapíxeles (1645 × 2547).

```bash
pnpm cloud:bench-renderer
```

### Paquete

| Worker del servicio    | Subida (MiB) | gzip (MiB) | Arranque, local (ms) |
| ---------------------- | -----------: | ---------: | -------------------: |
| antes del renderizador |         0,75 |       0,17 |                 27,1 |
| con el renderizador    |        22,51 |       7,37 |                 36,4 |

El renderizador añade JavaScript (5,80 MiB en total, desde 0,76: el motor del editor, fontkit y los
1,6 MB de ELK), los paquetes de iconos y la biblioteca (13,02 MiB de JSON, 7,43 de ellos del paquete
`logos`), resvg (2,36 MiB de WebAssembly), las fuentes que se miden (1,24 MiB) y las cuatro caras
del rasterizado (0,09 MiB). Las fuentes, los iconos y resvg son módulos que el objeto importa la
primera vez que dibuja, así que un aislado que nunca dibuja nunca los instancia; el JavaScript lo
analiza cada aislado (los 9 ms más de arranque).

### Tiempo

| Caso                                                  | Mediana (ms) | p95 (ms) | Máx. (ms) |
| ----------------------------------------------------- | -----------: | -------: | --------: |
| una petición al Worker solo (`ping`)                  |          3,7 |     26,3 |      31,9 |
| una llamada al objeto (`stats`)                       |          7,8 |      9,8 |      11,9 |
| arranque en frío: el primer SVG de un objeto          |        545,6 |    600,4 |     600,4 |
| el primer SVG de un segundo objeto, mismo aislado     |        292,8 |    324,8 |     324,8 |
| SVG de `flow/thirty`                                  |         68,3 |    107,7 |     180,0 |
| el primer PNG de un objeto (resvg y las caras)        |        210,9 |    212,4 |     212,4 |
| PNG 1280 de `flow/thirty` (1280 × 266)                |         85,5 |    115,0 |     164,9 |
| PNG 2048 de `flow/thirty` (2048 × 426)                |        102,3 |    121,6 |     242,4 |
| PNG 2048 de `sequence/thirty` (1645 × 2547, ajustado) |        174,2 |    234,5 |     263,5 |
| una respuesta de la caché (PNG 1280)                  |         13,7 |     16,7 |      42,1 |

### Frente a los límites

La documentación de Cloudflare, leída el 2026-11-04:

- [Límites de Workers](https://developers.cloudflare.com/workers/platform/limits/) (actualizada el
  2026-10-29): un Worker de 64 MiB sin comprimir en los planes Free y Paid, sin límite comprimido;
  un arranque de 1 segundo; 128 MB de memoria por aislado; 10 ms de tiempo de CPU por petición HTTP
  en el plan Free.
- [Límites de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/limits/)
  (actualizada el 2026-10-29): 30 segundos de CPU por petición de forma predeterminada, que cada
  petición o mensaje de WebSocket repone, configurables hasta 5 minutos; ninguna cifra aparte para
  el plan Free. Las [preguntas frecuentes](https://developers.cloudflare.com/durable-objects/reference/faq/)
  (actualizadas el 2026-04-21) dicen que los Durable Objects tienen los mismos límites de CPU por
  invocación que cualquier Worker.
- [Precios de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/)
  (actualizada el 2026-10-18): el plan Free incluye 100.000 peticiones y 13.000 GB-s al día.
- [Límites de Browser Run](https://developers.cloudflare.com/browser-rendering/platform/limits/)
  (actualizada el 2026-10-14): el plan Free tiene 10 minutos de navegador al día, 3 navegadores a la
  vez y un navegador nuevo cada 20 segundos.

El Worker cabe: 22,51 MiB de 64, y un arranque de decenas de milisegundos donde se permite un
segundo. Con los 30 segundos documentados de un Durable Object, el arranque en frío (0,6 s como
mucho) y el PNG más costoso (0,26 s como mucho) caben con holgura. Con 10 ms no cabría nada, ni
siquiera un SVG en caliente (68 ms): si el primer despliegue de staging muestra que el plan Free
limita un Durable Object a los 10 ms de un Worker, las vistas previas pasan a Browser Run, cuyos diez
minutos al día son unas 300 vistas previas de dos segundos cada una, para todo el servicio.

### Lo decidido

El renderizador se queda en el Worker del servicio, como dice la decisión 6 del diseño de
`agent-mcp`: cabe en el límite de tamaño, añade unos 9 ms al arranque de un aislado en el portátil y
deja sus fuentes, iconos y resvg a los aislados que dibujan. Un Worker propio es el paso que dar si
el paquete o la memoria de un aislado llegan a apretar: la clase en un script
`meltemi-diagrams-renderer` con las reglas del renderizador y su propia migración, al que el Worker
del servicio llega por un enlace de Durable Object con `script_name`; el Terraform de Meltemi Web lo
declararía como una entrada más de `local.workers`, sin dominio, y el despliegue lo subiría antes que
el Worker del servicio. La CPU de un Durable Object en el plan Free se confirma en el primer
despliegue de staging.
