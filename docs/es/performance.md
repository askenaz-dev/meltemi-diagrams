# Rendimiento

[English](../performance.md)

Generado por `pnpm bench --write` y `pnpm acceptance`; los objetivos y la máquina de referencia están
en la decisión 0032 y en [quality.md](../quality.md). Cada caso se ejecuta después de unas cuantas
ejecuciones que no se miden; del editor se mide el análisis que recibe un archivo tras una edición
(compilación, disposición y diagnósticos dentro de su proyecto) y un arrastre en el lienzo, desde el
mensaje hasta el nuevo dibujo.

Medido el 2026-10-15: 11th Gen Intel(R) Core(TM) i9-11980HK @ 2.60GHz, 16 hilos, 64 GB, win32 10.0.26300, Node v24.15.0.

| Caso                                                                                 | Mediana (ms) | p95 (ms) | Objetivo (p95, ms) |
| ------------------------------------------------------------------------------------ | -----------: | -------: | ------------------ |
| análisis sintáctico de acceptance/c4/thirty.meltemi (77 líneas)                      |         0,15 |     0,35 |                    |
| compilación de acceptance/c4/thirty.meltemi                                          |         0,34 |     0,82 |                    |
| compilación de un diagrama de 30 nodos (155 líneas)                                  |         0,89 |     1,43 |                    |
| planificar un arrastre, aplicarlo y recompilar, 30 nodos                             |         1,35 |     2,78 |                    |
| análisis sintáctico de un diagrama de 500 nodos (2505 líneas)                        |         7,77 |    30,60 |                    |
| compilación de un diagrama de 500 nodos (2505 líneas)                                |        17,62 |    33,92 |                    |
| exportación de un diagrama de 30 nodos con las fuentes incluidas                     |         2,36 |     4,04 |                    |
| exportación de un diagrama de 30 nodos con una biblioteca de fuentes nueva (en frío) |        86,86 |    93,15 |                    |
| exportación de un diagrama de 500 nodos con las fuentes incluidas                    |        70,81 |    88,22 |                    |
| organización con ELK y exportación de un diagrama `auto` de 30 nodos                 |        14,82 |    21,08 |                    |
| organización con ELK y exportación de un diagrama `auto` de 500 nodos                |       314,84 |   342,39 |                    |
| análisis tras una edición, flow (auto)                                               |        46,49 |    68,85 | menos de 500       |
| ida y vuelta de un arrastre en el lienzo, flow (auto)                                |        13,52 |    16,34 | menos de 100       |
| análisis tras una edición, sequence (30 elementos)                                   |         3,26 |     4,35 | menos de 500       |
| ida y vuelta de un arrastre en el lienzo, sequence (30 elementos)                    |         6,26 |     9,93 | menos de 100       |
| análisis tras una edición, c4 (30 elementos)                                         |        19,85 |    25,57 | menos de 500       |
| ida y vuelta de un arrastre en el lienzo, c4 (30 elementos)                          |         8,40 |    13,32 | menos de 100       |
| análisis tras una edición, free (30 elementos)                                       |         3,17 |     4,51 | menos de 500       |
| ida y vuelta de un arrastre en el lienzo, free (30 elementos)                        |         6,13 |    11,74 | menos de 100       |
| análisis tras una edición, flow (assisted)                                           |         5,27 |    10,82 | menos de 500       |
| ida y vuelta de un arrastre en el lienzo, flow (assisted)                            |         8,79 |    14,34 | menos de 100       |
