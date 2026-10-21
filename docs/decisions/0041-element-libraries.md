# 0041. Element libraries and the built-in provider icon sets

Status: accepted (element-libraries change, 14 October 2026)

## Context

The owner liked the icon picker and asked for what draw.io offers: libraries of ready-made
elements for AWS, Google Cloud, Azure and Kubernetes, by category, to pick from a panel. The
built-in pack was Tabler; provider icons had to be added to each project by hand, under the
project's own licence entries; the palette offered only the language's kinds. The owner approved
downloading the vendors' official sets and `@iconify-json/logos`.

## Decision

- **Vendor sets converted once, kept in the repository.** `pnpm vendor:icons` turns the vendors'
  downloads into Iconify files in `packages/assets/vendor/` with the vendor's categories, a label
  per icon and `info` naming the version, the author, the licence and the vendor's terms. Icons
  keep their geometry and colours; `<style>` rules are inlined, clip paths and filters dropped,
  editor metadata removed; icons the sanitiser still refuses are left out. Google Cloud's icons
  take categories from a table kept beside the script, since the download has none.
- **Terms travel with the sets.** The packs of AWS, Azure and Google Cloud are marked as not
  freely redistributable, as project packs of provider icons already could be; the licence
  inventory, the extension's and the playground's notices repeat each set's terms.
- **Libraries are data.** A library file lists elements by category (`icon`, `label`, optional
  `kind`). Every pack with categories is a library of its own; the built-in `tech` library curates
  the logos; projects add `assets/libraries/*.json` and plugins declare `libraries` under the
  `icons` permission.
- **The panel creates through the language.** A library element becomes a node (a box in free
  compositions) with the label and `style <id> { icon "…" }` on the next line: nothing new in the
  language, and the text stays the truth.
- **Packs load lazily in the browser.** The playground fetches a provider pack the first time a
  document or the panel needs it; the extension bundles them.

## Alternatives considered

- **Fetching the vendors' sets at run time.** Nothing a project uses is fetched (decision 0030);
  and the vendors' URLs change every release.
- **Only CC0 sets from npm.** Clean, but uneven: AWS is well covered by the logos, Azure and
  Google Cloud are not, Kubernetes has only its mark.
- **Provider shapes beyond a box with an icon.** The language's kinds and groups cover
  architecture diagrams; a group with an icon stands for a VPC or a cluster.

## Consequences

- `@meltemi/diagrams-assets` grows by about 3 MB of JSON and depends on `@iconify-json/logos`
  (7.8 MB); the extension and the playground bundle them, the playground fetching on demand.
- A new vendor release is adopted by rerunning the script and reviewing the icons it leaves out.
