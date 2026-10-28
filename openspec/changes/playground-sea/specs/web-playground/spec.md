## MODIFIED Requirements

### Requirement: Notices and versions
The page SHALL show its version and the generator's name, and an About dialog with the licence of
the product (MIT) and of every bundled component, linking to `NOTICES.md`: EPL-2.0 for elkjs with
its source link, OFL-1.1 for the fonts, Apache-2.0 for `@meltemi/ocean`, MIT for the others.
`pnpm licenses:inventory --check` SHALL cover the playground's bundled packages.

#### Scenario: Notices
- **WHEN** `NOTICES.md` of the built site is read
- **THEN** it names elkjs under EPL-2.0 with a link to its source, Inter under OFL-1.1 and `@meltemi/ocean` under Apache-2.0

#### Scenario: A bundled package missing from the notices
- **WHEN** `@meltemi/ocean` is bundled into the page and the inventory does not list it
- **THEN** `pnpm licenses:inventory --check` fails naming the package
