# Meltemi Diagrams — identidad de producto

Submarca de la herramienta de diagramas como código dentro de la familia Meltemi, el IDE agéntico.
Deriva del sistema de identidad Meltemi V2 (`Documentos/Meltemi/brand/v2`): el símbolo, el
wordmark, la paleta Egea y la tipografía son los de Meltemi y se usan sin modificarlos. Estos
activos pertenecen al proyecto Meltemi y siguen su licencia, no la licencia MIT del repositorio.

## Nombre

Meltemi es el viento del Egeo que empuja los veleros en verano. Los productos de la familia viven en
ese mismo universo de viento y navegación.

El nombre es **Meltemi Diagrams**, elegido por el responsable del producto el 10 de octubre de 2026
(decisión `docs/decisions/0009-product-name.md`). Dice lo que hace el producto sin ambigüedad y se
entiende igual en inglés y en español. Tagline: _The wind that draws_, en paralelo al _The wind that
writes_ de Meltemi.

| Opción considerada   | Lectura                                                                               | Por qué no                                                                    |
| -------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Meltemi Diagrams** | Nombra lo que el producto produce; los archivos son `.meltemi`.                       | Elegida.                                                                      |
| Meltemi Charts       | Las cartas náuticas son los mapas del navegante y "charts" son diagramas.             | "Charts" evoca gráficas de datos.                                             |
| Meltemi Draft        | "Drafting" es dibujo técnico, "draft" es una corriente de aire y "draught" el calado. | En español se lee como "borrador".                                            |
| Meltemi Rumbo        | El rumbo que traza el barco; "diagramas que marcan el rumbo".                         | Solo funciona en español.                                                     |
| Meltemi Flow         | El flujo del viento y los diagramas de flujo.                                         | `flow` ya es el nombre de un perfil del lenguaje: "un diagrama flow de Flow". |

El nombre aparece en un solo sitio del código, el token `brand` de los temas integrados
(`BRAND_NAME` en `packages/layout/src/theme.ts`), así que cambiarlo es cambiar una cadena y
regenerar los lockups.

## Lockup

El lockup de Meltemi (símbolo V2 + wordmark Meltemi en contornos de Inter SemiBold) se mantiene
intacto y se le añade una píldora `DIAGRAMS` en Aegean con texto monoespaciado. La píldora es el mismo
elemento visual que la herramienta dibuja como etiqueta (`tag`) en los diagramas, y cada producto de
la familia puede etiquetarse igual.

- `meltemi-diagrams-lockup-light.svg` — fondos claros: wordmark Ink, píldora Aegean con texto blanco,
  degradado oscuro (`#1D4ED8` → `#0891B2`).
- `meltemi-diagrams-lockup-dark.svg` — fondos oscuros: wordmark Sea Mist, píldora Cyan con texto Night,
  degradado claro (`#3B82F6` → `#22D3EE`).

El texto `DIAGRAMS` está vectorizado desde Cascadia Mono Regular a 40 px (la fuente monoespaciada
disponible al generar el activo), con 18 unidades de margen interior a cada lado de la píldora. Al cerrar la marca en la herramienta de diseño, volver a vectorizarlo con la
fuente mono definitiva de Meltemi; no usar texto vivo en el lockup.

## Glifo e icono de archivo

El glifo de producto son dos cajas unidas por un conector que sube hacia el noreste con la curva
de la ráfaga del símbolo, en trazo redondeado y degradado Egeo. No lleva punta de flecha ni
sustituye al símbolo de Meltemi: se usa para la UI del producto y para los tipos de archivo.

- `meltemi-diagrams-glyph.svg` — glifo sobre fondo transparente.
- `meltemi-diagrams-file-icon.svg` — icono para archivos `.meltemi`: el glifo sobre Meltemi Night con
  las proporciones del icono de aplicación de Meltemi (esquinas `rx 56`).

## Paleta

| Token     | Hex       | Uso en los diagramas exportados                    |
| --------- | --------- | -------------------------------------------------- |
| Night     | `#07111F` | Fondo del tema oscuro y del icono de archivo       |
| Ink       | `#0B1830` | Texto principal; banda de grupo en el tema oscuro  |
| Aegean    | `#2563EB` | Píldoras y etiquetas; origen del degradado         |
| Wind Cyan | `#22D3EE` | Destino del degradado; etiquetas en el tema oscuro |
| Sea Mist  | `#F7FBFF` | Fondo del tema claro; texto en el tema oscuro      |
| Muted     | `#526579` | Descripciones, conectores y título en el marco     |
| Line      | `#DCE5ED` | Contornos de cajas y línea del marco               |
| Band      | `#EAF1F8` | Relleno de bandas de grupo (`#0B1830` en oscuro)   |

En superficies claras la marca usa el degradado oscuro (`#1D4ED8` → `#0891B2`), como manda la guía
de Meltemi; en superficies oscuras, el degradado brillante.

## Tipografía

Inter para todo el texto de los diagramas (con `Segoe UI`, Roboto y Helvetica como reserva) y una
pila monoespaciada (`ui-monospace`, Cascadia Mono, Consolas) para etiquetas y píldoras. Las fuentes
no se incrustan en el SVG.

## La marca en los diagramas

La marca es un tema del lenguaje, no un ajuste del exportador. Los temas integrados `technical.light`
y `technical.dark` aplican la paleta, Inter y un marco de 44 px con el símbolo, el wordmark
`Meltemi Diagrams` y el título del diagrama; `stage.light` y `stage.dark` llevan el marco arriba
para presentaciones, y `editorial.*` no lo dibujan. Un archivo puede derivar su propio tema:

```text
theme konfio {
  extends "technical.light"
  accent "#6a4fd0"
  accentEnd "#a594f0"
  brand "Konfío · Meltemi Diagrams"
}
```

Ver `docs/language/styles.md` para los tokens y `docs/decisions/0007-branding-as-theme.md` y
`docs/decisions/0013-styles-and-themes.md` para las decisiones.

## Lámina

`meltemi-diagrams-board.svg` resume nombre, lockup, glifo, icono, paleta y marco de exportación. Es
una lámina de presentación con texto vivo, no un activo de producción.

## Reglas

- No modificar el símbolo de Meltemi: sin flechas, nodos, mástil, olas ni contenedor.
- Mantener la separación entre velas y casco; no unir ambos elementos.
- Tamaño mínimo del símbolo en el marco de exportación: 24 px, con degradado; por debajo, color
  sólido Aegean.
- La píldora de producto siempre va a la derecha del wordmark, centrada con la altura de las
  mayúsculas, con 20 unidades de separación.
