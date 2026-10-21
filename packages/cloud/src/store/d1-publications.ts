// The one read of the database the publish host makes: whether a publication exists at an address.
// It is a module of its own, apart from `d1Store`, so that the publish Worker (`publish-worker.ts`),
// which holds a D1 binding and nothing else, bundles this and not the whole store: its closure is a
// test (`publish-host.test.ts`). `d1Store` uses these definitions too, so the SQL is written once.

import type { D1Like } from "../env.js";
import type { Publication, PublicationReader } from "./types.js";

/** A row of `publications`, as the database gives it. */
export interface PublicationRecord {
  project_id: string;
  handle: string;
  slug: string;
  published_at: string;
  bytes: number;
}

export const PUBLICATION_COLUMNS = "project_id, handle, slug, published_at, bytes";

/** The publication at an address: by the unique key of `publications`. */
export const SELECT_PUBLICATION = `SELECT ${PUBLICATION_COLUMNS} FROM publications WHERE handle = ? AND slug = ?`;

export const toPublication = (row: PublicationRecord): Publication => ({
  projectId: row.project_id,
  handle: row.handle,
  slug: row.slug,
  publishedAt: row.published_at,
  bytes: Number(row.bytes),
});

/** The read the publish host makes: one statement, bound to the address, never built from it. */
export function d1PublicationReader(db: D1Like): PublicationReader {
  return {
    async publication(handle, slug) {
      const row = await db
        .prepare(SELECT_PUBLICATION)
        .bind(handle, slug)
        .first<PublicationRecord>();
      return row ? toPublication(row) : undefined;
    },
  };
}
