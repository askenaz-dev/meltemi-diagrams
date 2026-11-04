// The keys of the R2 bucket (`env.BLOBS`): one place, so that the materialiser, the blob routes, the
// thumbnails and the weekly collection name the same objects.

/** The bytes of a blob, named by their SHA-256 in lowercase hexadecimal. */
export const blobKey = (hash: string): string => `blobs/${hash}`;

/** A project's thumbnail (an SVG, one per project). */
export const thumbnailKey = (projectId: string): string => `thumbs/${projectId}.svg`;

/**
 * A published page: the HTML served at `/<handle>/<slug>/`. The weekly collection of blobs lists
 * `blobs/` alone, so it never touches these.
 */
export const publishedKey = (handle: string, slug: string): string =>
  `published/${handle}/${slug}/index.html`;
