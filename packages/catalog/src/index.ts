export const PACKAGE_NAME = "@meltemi/diagrams-catalog";

export {
  CATALOG_FORMAT,
  CATALOG_VERSION,
  catalogData,
  entityKey,
  entryKey,
  folderOf,
  type CatalogData,
  type CatalogElement,
  type CatalogEntity,
  type CatalogEntry,
  type CatalogInput,
  type CatalogOpens,
  type CatalogRelation,
  type CatalogTarget,
  type CatalogView,
  type DiagramEntry,
  type DiagramInput,
  type LinkTarget,
  type ModelInput,
  type OpensInput,
  type StoryEntry,
  type StoryInput,
} from "./data.js";
export { CATALOG_POLICY, catalogJson, catalogPage, type CatalogPageOptions } from "./html.js";
export { href, parseRoute, type Route } from "./routes.js";
export { kindLabel, normalize, searchCatalog, type SearchResult } from "./search.js";
export { escapeHtml, folders, navView, pageView, type PageView } from "./views.js";
