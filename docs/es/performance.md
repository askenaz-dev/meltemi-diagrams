# Rendimiento

[English](../performance.md)

Generado por `pnpm bench --write` y `pnpm acceptance`; los objetivos y la máquina de referencia están
en la decisión 0032 y en [quality.md](../quality.md). Cada caso se ejecuta después de unas cuantas
ejecuciones que no se miden; del editor se mide el análisis que recibe un archivo tras una edición
(compilación, disposición y diagnósticos dentro de su proyecto) y un arrastre en el lienzo, desde el
mensaje hasta el nuevo dibujo.

Medido el 2026-10-21: 11th Gen Intel(R) Core(TM) i9-11980HK @ 2.60GHz, 16 hilos, 64 GB, win32 10.0.26300, Node v24.15.0.

| Caso                                                                                 | Mediana (ms) | p95 (ms) | Objetivo (p95, ms) |
| ------------------------------------------------------------------------------------ | -----------: | -------: | ------------------ |
| análisis sintáctico de acceptance/free/shapes.meltemi (117 líneas)                   |         0,18 |     0,40 |                    |
| compilación de acceptance/free/shapes.meltemi                                        |         0,44 |     1,07 |                    |
| compilación de un diagrama de 30 nodos (155 líneas)                                  |         0,83 |     1,13 |                    |
| planificar un arrastre, aplicarlo y recompilar, 30 nodos                             |         1,26 |     3,19 |                    |
| análisis sintáctico de un diagrama de 500 nodos (2505 líneas)                        |         6,51 |    20,24 |                    |
| compilación de un diagrama de 500 nodos (2505 líneas)                                |        16,43 |    29,34 |                    |
| exportación de un diagrama de 30 nodos con las fuentes incluidas                     |         2,84 |     6,74 |                    |
| exportación de un diagrama de 30 nodos con una biblioteca de fuentes nueva (en frío) |        68,74 |    70,32 |                    |
| exportación de un diagrama de 500 nodos con las fuentes incluidas                    |        76,88 |    85,88 |                    |
| organización con ELK y exportación de un diagrama `auto` de 30 nodos                 |        14,30 |    19,70 |                    |
| organización con ELK y exportación de un diagrama `auto` de 500 nodos                |       322,61 |   325,40 |                    |
| análisis tras una edición, flow (auto)                                               |        50,98 |    63,71 | menos de 500       |
| ida y vuelta de un arrastre en el lienzo, flow (auto)                                |        11,02 |    13,06 | menos de 100       |
| análisis tras una edición, sequence (30 elementos)                                   |         1,70 |     2,43 | menos de 500       |
| ida y vuelta de un arrastre en el lienzo, sequence (30 elementos)                    |         4,08 |     6,68 | menos de 100       |
| análisis tras una edición, c4 (30 elementos)                                         |        15,88 |    21,31 | menos de 500       |
| ida y vuelta de un arrastre en el lienzo, c4 (30 elementos)                          |         7,61 |    11,19 | menos de 100       |
| análisis tras una edición, free (30 elementos)                                       |         2,64 |     5,75 | menos de 500       |
| ida y vuelta de un arrastre en el lienzo, free (30 elementos)                        |         4,86 |     8,55 | menos de 100       |
| análisis tras una edición, flow (assisted)                                           |         3,93 |     8,36 | menos de 500       |
| ida y vuelta de un arrastre en el lienzo, flow (assisted)                            |         6,95 |    11,99 | menos de 100       |
