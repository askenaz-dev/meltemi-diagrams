# Política de cambios del lenguaje

[English](../../language/policy.md)

Los archivos `.meltemi` se guardan durante años en repositorios y los leen herramientas de distintas
épocas. Esta página dice qué promete una versión del lenguaje, cómo cambia el lenguaje y cómo se
versionan los demás contratos que lo rodean. La [batería de conformidad](conformance.md) describe
cómo otra implementación puede comprobar los mismos contratos del lenguaje.

## Versiones

Un archivo nombra su versión del lenguaje en su primera instrucción:

```text
language "0.2"
```

El encabezado es opcional; un archivo sin él se lee con la versión que implementa la herramienta.
Una herramienta informa una versión que no implementa como `language.unsupported-version` y no
intenta adivinar.

El producto, el formato de intercambio y las API públicas tienen versiones independientes del lenguaje:

| Contrato                | Dónde se declara                                                   | Versión actual                                         | Reglas                                                        |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------- |
| El producto             | cada paquete, la CLI y la extensión                                | `mdg --version` o la versión de la extensión instalada | versionado semántico, todos a la par                          |
| El JSON del modelo      | `"version"` en cada archivo JSON del modelo (`MODEL_JSON_VERSION`) | 0.1                                                    | una versión nueva ante cualquier cambio de un campo existente |
| La API del modelo       | `MODEL_API_VERSION`; los plugins declaran el rango que aceptan     | 1.0.0                                                  | versionado semántico                                          |
| La API del renderizador | `RENDERER_API_VERSION`; los plugins declaran el rango que aceptan  | 1.0.0                                                  | versionado semántico                                          |

Una versión del producto puede dejar sin cambios el lenguaje, el JSON del modelo y las API. El
lenguaje actual es 0.2; no es el número de versión del producto.

## Qué promete una versión

Dentro de una versión del lenguaje, un archivo válido sigue siendo válido y conserva su significado:
el mismo modelo, el mismo dibujo con la misma versión de la herramienta y el mismo tema, y las
mismas exportaciones. Los cambios dentro de una versión solo agregan:

- instrucciones, propiedades, valores, perfiles o tipos de diagrama nuevos que ningún archivo válido
  podía contener antes;
- advertencias y diagnósticos de información nuevos, y errores para archivos que ya eran incorrectos
  pero no se informaban;
- mejores disposiciones de los elementos que el archivo deja al motor de disposición (`layout auto`,
  las cajas sin colocar en `layout assisted`). Lo que un archivo coloca, dimensiona o enruta no se
  mueve.

Un cambio necesita una versión nueva del lenguaje si:

- invalida un archivo válido o convierte una de sus advertencias en un error;
- cambia el significado de un archivo válido: lo que denota un elemento, una relación, una
  referencia o una instrucción, cómo se resuelve un id, un valor predeterminado o el orden de los
  mensajes;
- quita o cambia el nombre de una palabra clave, una propiedad o un valor.

Los códigos de diagnóstico son estables: un código nunca se reutiliza para otro problema, y dentro de
una versión su gravedad solo se eleva para archivos que siempre fueron incorrectos.

## Obsolescencia

Lo que el lenguaje va a quitar se declara obsoleto primero: una advertencia con su propio código
estable, un mensaje que dice qué lo reemplaza y una corrección rápida que reescribe el archivo. Una
obsolescencia se mantiene durante al menos una versión menor del producto antes de que una versión
nueva del lenguaje la quite.

## Migraciones

La CLI actual lee el lenguaje 0.2 y no tiene un subcomando `migrate`. La política siguiente se
aplica cuando se introduce una nueva versión del lenguaje:

Una versión nueva del lenguaje viene con un comando explícito, `meltemi-diagrams migrate`, que:

- escribe el archivo migrado junto al original, nunca en su lugar, y deja el original intacto;
- informa cada cambio que hizo, con sus líneas, y cada construcción que no pudo migrar;
- conserva los comentarios, los ids, la colocación y los estilos, como toda edición.

Las herramientas siguen leyendo la versión anterior del lenguaje durante al menos una versión mayor
del producto después de una nueva, para que un repositorio pueda migrar cuando lo decidan sus
responsables. Abrir un archivo más antiguo nunca lo reescribe.

## Cómo cambia el lenguaje

Las notas de cada versión describen las adiciones y las actualizaciones de la referencia. Consulta
el [registro de cambios](../../../CHANGELOG.md) y la versión del lenguaje en tus archivos. Las
reglas anteriores distinguen una mejora compatible de un cambio que requiere otra versión del lenguaje.

## Extensiones

Los plugins extienden el lenguaje como datos: tipos de diagrama con sus tipos de elemento,
propiedades y reglas, y paquetes de iconos ([plugins](../plugins.md)). Declaran las versiones del
modelo y del renderizador que aceptan, y una herramienta rechaza un plugin cuyos rangos no cumple
(`plugin.incompatible`). Un plugin no puede cambiar el significado del lenguaje integrado.
