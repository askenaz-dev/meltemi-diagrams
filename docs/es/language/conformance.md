# Conformidad

[English](../../language/conformance.md)

La batería de conformidad fija lo que significan los archivos `.meltemi`. Cualquier herramienta que
los lea, esta u otra, puede ejecutarla y saber si los lee como lo hace Meltemi Diagrams. Es el corpus
de este repositorio, con el resultado esperado de cada caso, y un ejecutor que recibe otra
implementación en forma de comandos.

```bash
pnpm conformance
```

## Casos

| Casos                                                | Una implementación es conforme cuando                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `corpus/valid/**/*.meltemi` (modelo)                 | el JSON del modelo que imprime es igual a `<name>.model.json`, comparado como JSON                                                       |
| `corpus/invalid/*.meltemi` (diagnósticos de archivo) | informa los códigos del lenguaje de `<name>.diagnostics.json`: todos los códigos salvo `layout.*` (el dibujo) y `asset.*` (los archivos) |
| `corpus/projects/valid/*` (proyecto válido)          | no informa ningún error en ningún archivo del proyecto                                                                                   |
| `corpus/projects/invalid/*` (proyecto no válido)     | informa, archivo por archivo, los códigos de `expected.json` salvo `layout.*`                                                            |

Los diagnósticos se comparan por código, así que los mensajes y su redacción pueden variar entre
implementaciones; los rangos forman parte del JSON del modelo. Los hallazgos de la disposición los
comprueban las pruebas propias de la disposición, porque dependen de las fuentes y de un motor de
disposición, no del lenguaje.

## Otra implementación

Pasa al ejecutor los comandos de la otra implementación, con `{file}` donde va la ruta:

```bash
pnpm conformance --command "my-tool to-json {file}" --diagnostics "my-tool check --json {file}"
```

- `--command` imprime el JSON del modelo de un archivo `.meltemi` en la salida estándar, en el
  formato que describe [JSON del modelo](model-json.md), como hace
  `meltemi-diagrams convert <file> --to json --stdout`.
- `--diagnostics` imprime los diagnósticos de un archivo o de una carpeta de proyecto como hace
  `meltemi-diagrams validate <path> --json`: `{ "files": [{ "path", "diagnostics": [{ "code", "severity" }] }] }`,
  con rutas relativas al repositorio o absolutas.

Se puede omitir cualquiera de los dos; entonces el ejecutor usa esta implementación para esa parte.
Los comandos se ejecutan desde la carpeta raíz del repositorio.

## Informe

El ejecutor imprime cada caso que falla con lo que difiere: la primera ruta JSON distinta en los
modelos (`differs at $.diagrams[0].relations[1].label`) o los códigos esperados y los informados en
los diagnósticos; después, los totales por tipo. Sale con 1 cuando falla un caso.

```text
  ✗ model valid/checkout.meltemi: differs at $.diagrams[0].relations[0].label
23 of 24 model cases pass
66 of 66 file diagnostics cases pass
5 of 5 valid project cases pass
39 of 39 invalid project cases pass
```

## Agregar casos

Cada cambio del lenguaje agrega sus casos ([política](policy.md)): un archivo válido y su JSON del
modelo, un archivo no válido con el nombre del diagnóstico que muestra, o una carpeta de proyecto con
`expected.json`. Las instantáneas las escriben las pruebas (`pnpm test -u`) y se revisan como el
código ([corpus](../../../corpus/README.md)).
