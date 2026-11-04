# Documentación

[English](../README.md)

Meltemi Diagrams convierte archivos de texto `.meltemi` en diagramas profesionales, que se editan
como código o en un lienzo, se animan y se exportan para documentos, diapositivas, la web y video.

## Para empezar

- [Primeros pasos](getting-started.md): la instalación, un primer proyecto, el lienzo y las
  exportaciones.
- [Funciones](features.md): todo lo que hace la 1.0, por áreas.
- [Galería](../../gallery/README.md) y el [ejemplo de compra](../../examples/purchase/README.md)
  (en inglés).
- [Compatibilidad y limitaciones conocidas](compatibility.md).

## Si vienes de otra herramienta

- [Desde Mermaid](tracks/from-mermaid.md)
- [Desde PlantUML](tracks/from-plantuml.md)
- [Desde un editor visual](tracks/from-visual-editors.md), como draw.io, Lucidchart o Visio

## El lenguaje

| Tema                                                                | Referencia                                                             |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Sintaxis, diagramas de flujo, colocación y estilos                  | [gramática](language/grammar-0.2.md)                                   |
| Composiciones libres                                                | [libre](language/free.md)                                              |
| Diagramas de secuencia y escenarios                                 | [secuencia](language/sequence.md)                                      |
| Modelos y vistas C4                                                 | [C4](language/c4.md)                                                   |
| Disposición, puertos, restricciones y comprobaciones                | [disposición](language/layout.md)                                      |
| Temas, clases y preajustes                                          | [estilos](language/styles.md)                                          |
| Iconos, imágenes y fuentes                                          | [recursos](language/assets.md), [fuentes](language/fonts.md)           |
| Efectos de movimiento e historias                                   | [movimiento](language/motion.md), [historias](language/stories.md)     |
| Exportaciones y perfiles de exportación                             | [exportación](language/export.md), [SVG](language/svg-export.md)       |
| Proyectos e importaciones entre archivos                            | [proyectos](language/projects.md)                                      |
| Formato del código                                                  | [formato](language/formatting.md)                                      |
| Todos los diagnósticos                                              | [diagnósticos](language/diagnostics.md)                                |
| El formato de intercambio JSON del modelo                           | [JSON del modelo](language/model-json.md)                              |
| Cómo cambia el lenguaje y cómo se ajustan a él las implementaciones | [política](language/policy.md), [conformidad](language/conformance.md) |

## Herramientas

- [La línea de comandos](cli.md): `init`, `preview`, `validate`, `format`, `layout`, `import`,
  `export`, `build catalog`, `review`, `assist`, la CI y los comandos de la nube (`login`, `push`,
  `pull`, `publish`, `projects`) que mantienen un proyecto al día con el servicio en la nube.
- [El editor para VS Code](editor.md): las funciones del lenguaje y el lienzo.
- [El playground](playground.md): todo en una pestaña del navegador, y proyectos en la nube cuando
  inicias sesión, compartidos por enlace, con personas, trabajados juntos en vivo y publicados como
  páginas web.
- [El servicio en la nube](cloud.md): el Worker del playground alojado, con su cuenta opcional,
  los tokens de API, el inicio de sesión de la línea de comandos y los proyectos guardados en la
  nube: salas, versiones, miniaturas y cuotas; compartir y permisos; la presencia que retransmite la
  sala; y la publicación en un host propio.
- [El reproductor HTML](player.md) y [el catálogo](catalog.md).
- [Importar Mermaid](import/mermaid.md) y [PlantUML](import/plantuml.md): en qué se convierte cada
  construcción.
- [Asistencia de IA](assist.md), opcional.
- [Dibujar con agentes de programación](agents.md): el prompt que configura un agente de
  programación, la skill, `skill install` y la página de configuración para agentes en
  `https://diagrams.meltemi.dev/es/agent-setup/`.
- [Plugins](plugins.md) y [seguridad](security.md).

## Calidad y proyecto

- [Calidad y aceptación](../quality.md), con los [últimos resultados](../quality/results.md)
  (en inglés), el [rendimiento](performance.md) y las comprobaciones de las exportaciones en
  [navegadores](../verification/browsers.md) y en
  [aplicaciones de oficina](../verification/office-apps.md) (en inglés).
- [Contribuir](../../CONTRIBUTING.md), [gobernanza](../../GOVERNANCE.md),
  [política de seguridad](../../SECURITY.md) y [publicación de versiones](../../RELEASING.md)
  (en inglés).
- [Registro de cambios](../../CHANGELOG.md), la [hoja de ruta de la 1.0](../roadmap-1.0.md) y las
  [notas de decisión](../decisions/) (en inglés).
- [Protocolo del piloto](../pilot/protocol.md) y [material del lanzamiento](../launch/announcement.md)
  (en inglés).
