# Diagramas de secuencia

[English](../../language/sequence.md)

Un diagrama de secuencia muestra los participantes de izquierda a derecha y lo que pasa entre ellos
de arriba abajo: llamadas, respuestas, activaciones, notas, alternativas y bucles. El orden de las
instrucciones es el orden de los eventos, así que el dibujo nunca necesita coordenadas.

```text
language "0.2"

diagram payment: sequence {
  theme "editorial.light"
  autonumber

  actor customer "Cliente"
  participant api "API"
  participant bank "Banco"

  customer -> api: "Pagar" as pay
  activate api
  api -> bank: "Autorizar" as authorize

  alt result "Aprobado" {
    bank --> api: "OK" as approved
    api --> customer: "Confirmación" as success
  } else "Rechazado" {
    bank --> api: "Rechazo" as declined
    api --> customer: "Reintentar" as retry
  }

  deactivate api

  scenario approved "Pago aprobado" {
    choose result "Aprobado"
  }
}
```

Los diagramas de secuencia se compilan en el mismo modelo que los diagramas de flujo y las
composiciones libres (decisión 0019): los participantes son elementos, las cajas de participantes
son grupos y los mensajes son relaciones. Los ids, las etiquetas, las descripciones, `class`,
`style`, `rule`, `animate`, `link`, los temas, los preajustes, los lienzos y el marco con el logotipo
funcionan como en los demás perfiles. Sus instrucciones propias están a continuación.

## Participantes

| Declaración                  | Cabecera                                             |
| ---------------------------- | ---------------------------------------------------- |
| `participant <id> ["Label"]` | una caja con la etiqueta                             |
| `actor <id> ["Label"]`       | una persona sobre la etiqueta                        |
| `boundary <id> ["Label"]`    | la figura UML de límite                              |
| `control <id> ["Label"]`     | la figura UML de control                             |
| `entity <id> ["Label"]`      | la figura UML de entidad                             |
| `database <id> ["Label"]`    | un cilindro                                          |
| `collections <id> ["Label"]` | cajas apiladas                                       |
| `queue <id> ["Label"]`       | un cilindro horizontal                               |
| `group <id> ["Label"] { … }` | una caja alrededor de los participantes que contiene |

`id["Label"]` declara un `participant` e `id[("Label")]`, un `database`. Un participante que solo
mencionan los mensajes es un `participant` implícito, con su id como etiqueta. Los participantes se
ubican en el orden del código fuente: los declarados, donde se declaran; los implícitos, en su
primera mención. Los bloques de participante aceptan `description`, `class` y `link`; los grupos
solo contienen declaraciones de participantes.

## Mensajes

```text
a -> b: "Call" as call          // una llamada: línea continua, punta rellena
b --> a: "Reply" as reply       // una respuesta: línea discontinua, punta abierta
a -> c: "Event" as event { kind async }   // asíncrono: línea continua, punta abierta
a -> a: "Validate"              // una autollamada hace un bucle hacia la derecha
a <-> c: "Sync"                 // bidireccional: la misma punta en ambos extremos
```

Los estilos `arrowhead` y `arrowtail` dan a un mensaje cualquier punta en cualquiera de sus extremos
([styles.md](styles.md#puntas-de-flecha)).

`kind sync` es el valor predeterminado y nunca se escribe. Los mensajes aceptan `description`,
`class` y `kind`; `label <message> at 50% offset (dx, dy)` en `placement` mueve una etiqueta a lo
largo de su flecha. `autonumber` numera los mensajes desde 1 en pequeños discos; `autonumber 10`
empieza en 10.

## Eventos

Cada instrucción de abajo es un evento. Los eventos ocurren en el orden en que se escriben.

| Instrucción                                                         | Significado                                                                            |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `activate <p>`, `deactivate <p>`                                    | empieza o termina una barra de activación; las barras anidadas se separan 5            |
| `create <p>`                                                        | la cabecera se dibuja aquí; el siguiente mensaje hacia el participante termina en ella |
| `destroy <p>`                                                       | la línea de vida termina con una cruz                                                  |
| `note [<id>] over <p>[, <q>…] "Text"`                               | una nota que cruza los participantes                                                   |
| `note [<id>] left of <p> "Text"`, `note [<id>] right of <p> "Text"` | una nota junto a una línea de vida                                                     |
| `divider "Label"`                                                   | una línea doble que cruza todas las líneas de vida                                     |
| `delay ["Label"]`                                                   | un salto en el tiempo                                                                  |

Una barra de activación empieza en el mensaje que lleva a su `activate` y termina en el mensaje
anterior a su `deactivate`. Las activaciones que siguen abiertas al final llegan hasta el final de
la línea de vida.

## Fragmentos

| Fragmento                                                  | Significado                            |
| ---------------------------------------------------------- | -------------------------------------- |
| `alt [<id>] ["Condition"] { … } else ["Other"] { … } …`    | alternativas                           |
| `opt [<id>] ["Condition"] { … }`                           | una parte opcional                     |
| `loop [<id>] ["Until …"] { … }`                            | una parte repetida                     |
| `par [<id>] ["Label"] { … } and ["Label"] { … } …`         | partes en paralelo                     |
| `break [<id>] ["Condition"] { … }`                         | termina la interacción que lo contiene |
| `critical [<id>] ["Label"] { … } option ["Other"] { … } …` | una parte atómica con opciones         |
| `region [<id>] ["Label"] { … }`                            | una región con etiqueta                |

Los fragmentos contienen eventos y fragmentos anidados, nunca declaraciones. Se dibujan como un
marco alrededor de las líneas de vida que tocan sus eventos, con el operador en una pestaña, las
condiciones entre corchetes y líneas discontinuas entre las ramas. Las condiciones son
descripciones, nunca lógica.

## Ids y espaciado

Las notas y los fragmentos con id, y los mensajes nombrados con `as <id>`, comparten el espacio de
nombres del diagrama con los participantes. Los demás eventos tienen claves como `activate#1` o
`note#2`, que usan las herramientas y que el texto nunca escribe.

```text
placement {
  space authorize 28   // 28 más sobre el mensaje, la nota o el fragmento
  gap bank 40          // 40 más a la izquierda del participante
}
```

`space` nombra un mensaje, una nota o un fragmento con id; `gap` nombra un participante. Ninguno de
los dos cambia nunca el orden de los eventos. `style`, `class` y `rule` se aplican a los
participantes, a los mensajes con nombre y a las notas y los fragmentos con id; `rule note { … }` y
`rule fragment { … }` dan estilo a todas las notas y a todos los fragmentos.

## Reglas comprobadas según el orden

Los eventos se comprueban en orden, con un estado por participante (profundidad de activación,
creado, destruido):

| Código                | Cuándo                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `sequence.activation` | `deactivate` de un participante que no está activo                                                                 |
| `sequence.lifecycle`  | un evento después de `destroy`; `create` después de que el participante apareció, o dos veces; `destroy` dos veces |
| `ref.unknown-element` | un participante desconocido en un evento, o un grupo usado como participante                                       |

Cada rama de `alt`, `par` y `critical` parte del estado anterior al fragmento, y el estado posterior
es el de la primera rama. Los demás fragmentos se comprueban como su cuerpo.

## Escenarios

Un escenario es un camino a través de las alternativas y los bucles, para las exportaciones y, más
adelante, para la reproducción.

```text
scenario declined "Pago rechazado" {
  choose result "Rechazado"   // una rama de alt o critical, por condición o por número desde 1
  repeat polling 3            // las pasadas de un loop, de 1 a 100
  skip coupon                 // un opt o un break que no se toma
  take audit                  // un opt o un break que se toma (lo predeterminado)
}
```

- Los fragmentos que no se listan toman su primera rama y una pasada, y se toman. `par` y `region`
  siempre se dibujan completos.
- Un fragmento desconocido, un operador que no acepta la instrucción, una rama desconocida y las
  pasadas fuera de rango son `sequence.scenario`.
- Un escenario dibuja el camino elegido: los `alt`, `critical`, `opt` y `break` decididos pierden su
  marco, un bucle se convierte en su cuerpo repetido en marcos con las etiquetas `[Until … 1/3]`,
  `[Until … 2/3]`… (una sola pasada conserva su etiqueta), y el título suma la etiqueta del
  escenario.

`meltemi-diagrams export payment.meltemi --scenario approved` escribe `payment.approved.svg`
(`<stem>.<diagram>.<scenario>.svg` en los archivos con varios diagramas); un escenario desconocido es
un error de uso que enumera los que existen. En VS Code, Exportar SVG pregunta por "Todos los
eventos" o por un escenario, y la barra de herramientas del lienzo muestra un escenario en vista
previa, de solo lectura.

## Disposición

Los diagramas de secuencia se disponen sin motor, de forma determinista:

- **Columnas.** Las cabeceras se miden a partir de sus etiquetas. Los centros contiguos están
  separados al menos por la mitad de cada cabecera más 40, más `gap`. Un mensaje necesita el ancho
  de su etiqueta más 24 entre sus columnas; las autollamadas y las notas laterales necesitan espacio
  junto a su columna.
- **Filas.** Los eventos van de arriba abajo: los mensajes con su etiqueta sobre la flecha, las
  autollamadas 24 más altas, las notas, los encabezados de los fragmentos y las separaciones entre
  ramas, los separadores y los retrasos. `space` agrega su cantidad sobre un evento.
- **Las comprobaciones de composición** no se aplican: las filas y las columnas no se pueden
  superponer.
- **Dibujo.** Las cabeceras, las barras de activación, las notas y los marcos de los fragmentos se
  trazan con el color `muted` del tema sobre un relleno `surface`, y las líneas de vida van
  discontinuas en `muted` a media intensidad, para que los mensajes, dibujados en `connector`,
  queden delante. Un `stroke` escrito para un participante colorea su cabecera y su línea de vida.
  Las cajas miden 40 unidades de alto, al pie de la fila de cabeceras cuando un actor u otra figura
  la hace más alta.

`LayoutResult.boxes` contiene las cabeceras tal como se dibujan, las notas y los marcos de los
fragmentos (por clave de evento); `shapes` y `radii`, el contorno de cada cabecera que es una caja
(`rounded` con el radio del tema, `cylinder` para una base de datos); `connectors` y `labels`, los
mensajes; `events`, la fila de cada evento. Los editores los usan para seleccionar, arrastrar y
saber qué hay bajo el puntero.

## Edición

Las ediciones mantienen el orden de los eventos (consulta [editor.md](../editor.md)):

- arrastrar un participante hacia un lado reordena su declaración y no cambia ningún mensaje;
- arrastrar hacia abajo un mensaje, una nota o un fragmento escribe `space`, que nunca baja de 0,
  así que nada pasa a su vecino;
- cruzar un evento es un movimiento explícito y validado (Alt+Arriba y Alt+Abajo), que se rechaza cuando
  rompería las reglas comprobadas según el orden;
- las activaciones, las notas y los fragmentos se quedan con sus mensajes; quitar un participante
  enumera primero sus mensajes, sus eventos y su espaciado.
