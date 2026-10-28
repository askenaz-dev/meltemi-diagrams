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
