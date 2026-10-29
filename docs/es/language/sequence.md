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
primera mención. Los bloques de participante aceptan `description`, `class`, `link` y `tag`
([marcas](#marcas)); los grupos solo contienen declaraciones de participantes.

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
`class`, `kind` y `tag` ([marcas](#marcas)); `label <message> at 50% offset (dx, dy)` en
`placement` mueve una etiqueta, con todas sus líneas, a lo largo de su flecha. `autonumber` numera
los mensajes desde 1 en pequeños discos; `autonumber 10` empieza en 10.

La etiqueta de un mensaje queda en una línea y separa a sus dos participantes tanto como necesita
([columnas](#disposición)). Cuando un `gap` negativo, o un `spacing` menor que el de por defecto,
los acerca, la etiqueta se ajusta al espacio que queda entre sus líneas de vida: su distancia menos
12 unidades a cada lado, y menos el disco del número con `autonumber`. Se parte en los espacios,
una palabra más ancha que el espacio entre sus letras, y un `\n` escrito en la etiqueta siempre
empieza una línea. Las líneas se separan 1,25 veces el tamaño de la etiqueta, la flecha se dibuja
debajo de la última y los eventos de abajo bajan, así que un par acercado da una fila más alta en
vez de rechazar el gap. Mover una etiqueta con `label … at` conserva sus líneas. La etiqueta de una
autollamada se queda junto a su bucle, partida solo donde se escribe `\n`.

```text
customer -> api: "Pay for the order with the saved card" as pay   // una línea, api más a la derecha
api -> bank: "Authorize\nthe card" as authorize                    // dos líneas, siempre

placement {
  gap api -40   // api 40 más cerca de lo que la etiqueta lo separaba: la etiqueta de pay se ajusta
}
```

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
- El bloque de una llamada contiene sus propiedades (`kind`, `description`, `class`, `tag`) y sus
  eventos; el bloque propio de un `return` solo acepta propiedades.

## Marcas

`tag "Text"` en el bloque de un mensaje o de un participante lo marca con una palabra corta: un
protocolo, una versión, una propiedad ("PKCE", "v2", "idempotent", "external").

```text
participant bank "Bank" { tag "external" }   // una insignia sobre la cabecera

api -> bank: "Authorize" as authorize {
  tag "PKCE"                                 // píldoras sobre la flecha, junto a su origen
  tag "v2"
}
```

- Un bloque acepta cualquier cantidad de marcas, en orden, entre sus demás propiedades. Todos los
  mensajes las aceptan, también una autollamada y un `return`; en el bloque de una llamada, una
  marca es de la llamada, antes o después de sus eventos, nunca un evento.
- Las marcas de un mensaje son píldoras sobre su flecha, de izquierda a derecha en el orden del
  código fuente, a 4 unidades una de otra, junto a su extremo de origen: a 6 unidades del comienzo
  de la flecha, a 12 cuando el mensaje está numerado. Su etiqueta sube media píldora y 2, así que
  nunca se tocan. Las píldoras de una autollamada van en la parte de arriba de su bucle, y su
  etiqueta después de ellas.
- Las marcas de un participante son insignias centradas sobre su cabecera: con su centro en el
  borde superior de una caja (participant, database, collections, queue) y su base 4 unidades por
  encima de una figura (actor, boundary, control, entity). Cuando algún participante tiene marcas,
  la fila de cabeceras empieza más abajo para dejarles lugar, y también una cabecera que dibuja
  `create`.
- Las píldoras se ven como una marca de flujo: el relleno `tag` y el color `tagText` del tema, a
  `tagSize` en la fuente monoespaciada. Una marca no tiene id, así que `style`, `class`, `rule`,
  `animate`, `link` y las historias nunca la nombran; un efecto, un resaltado o una historia que
  muestra, oculta o enfoca a su dueño lleva consigo sus marcas.

| Escrito                                                                    | Informado                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `tag ""`, o un texto con un salto de línea                                 | `prop.invalid-value`: una marca es una línea de texto       |
| `tag t1 "PKCE"`, `tag 12`, `tag "A" "B"`, un bloque                        | `prop.invalid-value`, que nombra la forma `tag "Text"`      |
| el mismo texto dos veces en un mismo dueño                                 | `prop.duplicate` en el segundo, relacionado con el primero  |
| `tag` en el nivel del diagrama, en el bloque de un grupo o en un fragmento | `prop.unknown`, con una pista que dice dónde van las marcas |

`tag <id> "Text"` sigue siendo la píldora del perfil de flujo
([grammar-0.2.md](grammar-0.2.md#vocabulario-flow)), y `tag "Text"` en un bloque de un diagrama de
flujo, libre o C4 es `prop.unknown`. El JSON del modelo enumera las marcas de cada elemento y cada
relación como `tags` ([model-json.md](model-json.md#elemento)).

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
  izquierda y el `gap` antes de la de la derecha cuando su suma es positiva, y se separan más
  cuanto necesiten los mensajes entre ellas en una línea: el ancho de cada etiqueta más 24 (y 22
  más con `autonumber`), la fila de píldoras de un mensaje más 24, el disco y la punta de la
  flecha, y el espacio que necesitan las autollamadas y las notas laterales junto a su columna. Esa
  es la distancia natural del par. Un acercamiento lo acerca más que ella en su cantidad: una suma
  negativa de los dos `gap`, y un `spacing` menor que 40 en la diferencia, así que una cabecera
  arrastrada queda donde se suelta. Un acercamiento se detiene en el mínimo del par: la mitad de
  cada cabecera más 8 (una cabecera cuenta como la más ancha entre ella y sus insignias), la
  palabra más larga de la etiqueta de cada mensaje entre sus columnas más 24 (y el disco), la fila
  de píldoras, las autollamadas y las notas laterales; las etiquetas entre el par se ajustan al
  espacio que les queda. Cuando un gap negativo acercaría un par más que el mínimo, gana el mínimo
  y `layout.gap-floor` avisa en el `gap` con la cantidad dibujada, medida desde la distancia
  natural. Un `gap` antes del primer participante o después del último agrega espacio en ese lado
  del diagrama.
- **Filas.** Los eventos van de arriba abajo: los mensajes con su etiqueta sobre la flecha, con la
  fila más alta por cada línea ajustada después de la primera y por media píldora y 2 cuando el
  mensaje tiene marcas, las autollamadas 24 más altas, las notas, los encabezados de los fragmentos
  y las separaciones entre ramas, los separadores y los retrasos. `space` agrega su cantidad sobre
  un evento, y `space … after`, debajo. El bloque de una llamada ocupa sus filas justo después de
  la de la llamada, y su `return` se dibuja desde el borde de la barra del receptor hasta quien
  llama. Cuando algún participante tiene marcas, la fila de cabeceras empieza más abajo por el
  lugar que necesitan: media píldora sobre una caja, una píldora y 4 sobre una figura.
- **Las comprobaciones de composición** no se aplican: las filas y las columnas no se pueden
  superponer. La auditoría de etiquetas mide cada línea de una etiqueta ajustada, y el texto de una
  marca contra su píldora.
- **Dibujo.** Las cabeceras, las barras de activación, las notas y los marcos de los fragmentos se
  trazan con el color `muted` del tema sobre un relleno `surface`, y las líneas de vida van
  discontinuas en `muted` a media intensidad, para que los mensajes, dibujados en `connector`,
  queden delante. Un `stroke` escrito para un participante colorea su cabecera y su línea de vida.
  Las cajas miden 40 unidades de alto, al pie de la fila de cabeceras cuando un actor u otra figura
  la hace más alta.

`LayoutResult.boxes` contiene las cabeceras tal como se dibujan, las notas, los marcos de los
fragmentos y las barras de activación escritas (por clave de evento); `shapes` y `radii`, el
contorno de cada cabecera que es una caja (`rounded` con el radio del tema, `cylinder` para una base
de datos); `connectors` y `labels`, los mensajes, con la caja de una etiqueta abarcando todas sus
líneas; `messageTexts`, el espacio al que se ajusta la etiqueta de cada mensaje, sus líneas tal
como se dibujan, su tamaño y su separación, y si se ajusta (cuando un acercamiento limita su
espacio; no en una autollamada ni a la distancia natural); `bars`, cada
barra de activación por la clave de su `activate` o de la llamada cuyo bloque la dibuja, con su
participante, su caja, su profundidad y el `deactivate` que la termina; `tags`, las píldoras de
cada participante y cada mensaje con marcas; `events`, la fila de cada evento. En la escena, cada
barra es un grupo de rol `event` dentro del grupo de su línea de vida
(`<g data-id="activate#1" data-role="event">`), y cada marca un grupo de rol `tag` dentro del de su
dueño (`<g data-id="authorize" data-role="tag" data-tag="0">`). Los editores los usan para
seleccionar, arrastrar y saber qué hay bajo el puntero.

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
- Alt+A, el botón **Activar** y la casilla **Activa el receptor** del inspector escriben o quitan
  el par `activate`/`deactivate` del receptor después de un mensaje; una barra de activación
  escrita se selecciona con un clic, sus tiradores de arriba y de abajo mueven su `activate` o su
  `deactivate` detrás de otro evento (se rechaza indicando el motivo cuando las reglas comprobadas
  según el orden lo impiden), y Supr quita el par;
- T, el botón **Marca** y la lista **Marcas** del inspector agregan, reescriben y quitan
  instrucciones `tag`, y crean el bloque cuando la instrucción no lo tiene y lo quitan cuando no
  queda nada más en él; un doble clic en una píldora la edita en su sitio;
- la etiqueta de un mensaje se escribe donde se ajusta: el editor es tan ancho como el espacio
  entre las líneas de vida y crece hacia abajo, y Mayús+Entrar escribe `\n`;
- las activaciones, las notas y los fragmentos se quedan con sus mensajes; quitar un `activate` o
  un `deactivate` quita su par; quitar un participante enumera primero sus mensajes, sus eventos y
  su espaciado, y quitar una llamada quita con ella los eventos de su bloque.
