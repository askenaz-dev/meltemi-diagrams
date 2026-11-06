# Mantenimiento del lenguaje

[English](../language-maintenance.md)

Procedimientos para mantener el corpus y la política, extraídos de las referencias públicas.
La última sección conserva preguntas históricas de los prototipos; esta auditoría no adopta
una gramática 0.3 ni cambia las decisiones normativas.

## Cómo cambia el lenguaje

Cada cambio del lenguaje es un cambio de OpenSpec (`openspec/changes/`) con:

1. una nota de decisión en `docs/decisions/` que nombra el problema, las alternativas y lo que ven
   los archivos existentes;
2. la actualización de la gramática en [grammar-0.2.md](../../es/language/grammar-0.2.md) (o en la gramática de la
   versión siguiente) y las referencias de los perfiles afectados;
3. casos de conformidad nuevos: archivos válidos con su JSON del modelo y archivos no válidos con sus
   diagnósticos en `corpus/`, y un caso de proyecto cuando el cambio afecta a los proyectos;
4. los diagnósticos en [diagnostics.md](../../es/language/diagnostics.md), con las correcciones rápidas;
5. las tablas de cobertura de los importadores cuando el cambio traduce una construcción de Mermaid
   o PlantUML.

Un cambio que necesita una versión nueva del lenguaje también describe la migración y sus pruebas.

## Agregar casos

Cada cambio del lenguaje agrega sus casos ([política](../../es/language/policy.md)): un archivo válido y su JSON del
modelo, un archivo no válido con el nombre del diagnóstico que muestra, o una carpeta de proyecto con
`expected.json`. Las instantáneas las escriben las pruebas (`pnpm test -u`) y se revisan como el
código ([corpus](../../../corpus/README.md)).

## Aún sin decidir

Se aplaza a una decisión de la gramática 0.3, después de los prototipos de la etapa 2:

- La semántica de los grupos: si los grupos crean espacios de nombres y cómo interactúan las
  referencias calificadas con el cambio de nombre.
- Si las cláusulas encadenadas pueden empezar en la línea siguiente a la `}` de cierre.
