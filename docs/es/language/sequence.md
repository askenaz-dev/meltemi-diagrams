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
([styles.md](styles.md#puntas-de-flecha)). Un mensaje es una llamada o una respuesta, así que las
líneas sin puntas, `--` y `---`, no son mensajes: `prop.invalid-value` sobre el símbolo nombra las
cuatro flechas.

`kind sync` es el valor predeterminado y nunca se escribe. Los mensajes aceptan `description`,
`class` y `kind`; `label <message> at 50% offset (dx, dy)` en `placement` mueve una etiqueta a lo
largo de su flecha. `autonumber` numera los mensajes desde 1 en pequeños discos; `autonumber 10`
empieza en 10.

### Llamadas y respuestas

El bloque de una llamada contiene lo que la llamada provoca, además de sus propiedades: los eventos
que se escriben en él ocurren mientras el receptor atiende la llamada, y `return` la responde.

```text
customer -> api: "Pay" as pay {
  api -> bank: "Authorize" as authorize {
    return "Approved" as approved   // bank --> api
  }
  return "Receipt" as receipt       // api --> customer
}
```

- Un bloque con eventos mantiene activo al receptor desde la llamada hasta su último evento, como
  lo harían un `activate` y un `deactivate`; una llamada con eventos dentro de otra dibuja su propia
  barra en su receptor, anidada cuando ese receptor ya está activo.
- `return ["Label"] [as <id>] [{ … }]` es una respuesta del receptor a quien hizo la llamada que lo
  rodea: un mensaje discontinuo cuyos extremos y línea vienen de la llamada. Es el último evento de
  su lista; un `return` en una rama de un fragmento termina solo esa rama.
- Un `return` fuera del bloque de una llamada, o un evento después de un `return` en la misma
  lista, es `sequence.return`.
- El bloque de una llamada contiene sus propiedades (`kind`, `description`, `class`) y sus eventos;
  el bloque propio de un `return` solo acepta propiedades.

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
| `return ["Label"] [as <id>]`                                        | en el bloque de una llamada, la respuesta a quien llama                                |

Una barra de activación empieza en el mensaje que lleva a su `activate` y termina en el mensaje
anterior a su `deactivate`. Las activaciones que siguen abiertas al final llegan hasta el final de
la línea de vida. Una llamada cuyo bloque contiene eventos dibuja la barra del receptor desde la
flecha de la llamada hasta el último evento del bloque, sin `activate`; un `deactivate` que
terminaría esa barra es `sequence.activation`.

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
spacing 56                 // entre las cabeceras de participantes vecinos (40)

placement {
  space authorize 28       // 28 más sobre el mensaje, la nota o el fragmento
  space poll 20 after      // 20 más debajo
  gap bank 40              // 40 más a la izquierda del participante
  gap ledger 24 after      // 24 más a su derecha
  gap api -12              // 12 más cerca del participante de su izquierda
}
```

`spacing` es la distancia entre las cabeceras de participantes vecinos antes de sus gaps: 40 cuando
no se escribe, de 0 a 400. `space` nombra un mensaje, una nota o un fragmento con id; `gap` nombra
un participante. Los dos aceptan un lado después de la cantidad: `before`, el predeterminado, que
nunca se escribe (encima de un evento, a la izquierda de un participante), o `after` (debajo, a la
derecha); un destino acepta una instrucción por lado. Un `space` es 0 o más. Un `gap` puede ser
negativo para acercar un participante a su vecino, salvo en el lado exterior: un `gap` negativo
antes del primer participante o después del último es `prop.invalid-value`, porque ahí no hay nada
que acercar. Ninguno de los dos cambia nunca el orden de los eventos. `style`, `class` y `rule` se
aplican a los participantes, a los mensajes con nombre y a las notas y los fragmentos con id;
`rule note { … }` y `rule fragment { … }` dan estilo a todas las notas y a todos los fragmentos.

## Reglas comprobadas según el orden

Los eventos se comprueban en orden, con un estado por participante (profundidad de activación,
creado, destruido):

| Código                | Cuándo                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `sequence.activation` | `deactivate` de un participante que no está activo, o que terminaría la barra del bloque de una llamada            |
| `sequence.return`     | `return` fuera del bloque de una llamada; un evento después de un `return` en la misma lista                       |
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
  separados por la mitad de cada cabecera más `spacing` (40), más el `gap` después de la de la
  izquierda y el `gap` antes de la de la derecha; un gap negativo resta. Un par nunca se acerca más
  que su mínimo: la mitad de cada cabecera más 8, el ancho de la etiqueta de un mensaje más 24 entre
  sus columnas, y el espacio que necesitan las autollamadas y las notas laterales junto a su
  columna. Cuando un gap negativo acercaría un par más que eso, gana el mínimo y `layout.gap-floor`
  avisa en el `gap` con la cantidad dibujada. Un `gap` antes del primer participante o después del
  último agrega espacio en ese lado del diagrama.
- **Filas.** Los eventos van de arriba abajo: los mensajes con su etiqueta sobre la flecha, las
  autollamadas 24 más altas, las notas, los encabezados de los fragmentos y las separaciones entre
  ramas, los separadores y los retrasos. `space` agrega su cantidad sobre un evento, y
  `space … after`, debajo. El bloque de una llamada ocupa sus filas justo después de la de la
  llamada, y su `return` se dibuja desde el borde de la barra del receptor hasta quien llama.
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

- arrastrar la cabecera de un participante más allá del centro de un vecino reordena su
  declaración y no cambia ningún mensaje; un arrastre más corto escribe su `gap` anterior, y la
  línea de estado lo dice cuando el mínimo dibuja menos de lo escrito;
- arrastrar hacia abajo un mensaje, una nota o un fragmento escribe `space`, que nunca baja de 0,
  así que nada pasa a su vecino; una llamada se mueve con su bloque;
- cruzar un evento es un movimiento explícito y validado (Alt+Arriba y Alt+Abajo), que entra y sale
  de los bloques de las llamadas y se rechaza cuando rompería las reglas comprobadas según el orden;
- Alt+N anida los eventos seleccionados en la llamada que los precede, Alt+Mayús+N saca los eventos
  de una llamada detrás de ella, cada `return` escrito como una respuesta, y Alt+R agrega un
  `return` al final del bloque de la llamada;
- las activaciones, las notas y los fragmentos se quedan con sus mensajes; quitar un participante
  enumera primero sus mensajes, sus eventos y su espaciado, y quitar una llamada quita con ella los
  eventos de su bloque.
