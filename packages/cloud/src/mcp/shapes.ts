// What several of the Worker's tools need beyond the shared shapes of `@meltemi/diagrams-mcp`: a
// project's address in the app for this deployment, and the bytes of the images and fonts a
// drawing uses, read from R2.

import {
  MAX_DRAWING_BINARY_BYTES,
  appUrl as appAddress,
  drawingBinaryPaths,
} from "@meltemi/diagrams-mcp";
import type { OpCtx } from "../context.js";
import { ApiError, fail } from "../errors.js";
import { blobKey } from "../keys.js";
import type { RenderersApi } from "../renderer-client.js";
import type { RoomFiles } from "../rooms.js";

/** The address that opens a project in the app (the app takes a project, not a file, in its address). */
export function appUrl(op: OpCtx, projectId: string): string {
  return appAddress(op.config.origin, projectId);
}

/**
 * The bytes of the images and fonts the project's files may use (`drawingBinaryPaths`), from R2. An
 * object missing from R2 is left out, and the drawing reports the image it could not find. More
 * than 24 MiB in all is `request.invalid`.
 */
export async function drawingBinaries(
  op: OpCtx,
  snapshot: RoomFiles,
): Promise<Record<string, Uint8Array>> {
  const wanted = drawingBinaryPaths(snapshot.files, snapshot.binaries);
  const out: Record<string, Uint8Array> = {};
  let total = 0;
  for (let at = 0; at < wanted.length; at += 8) {
    const read = await Promise.all(
      wanted.slice(at, at + 8).map(async ([path, hash]) => {
        const object = await op.env.BLOBS.get(blobKey(hash));
        if (!object) return undefined;
        return [path, new Uint8Array(await new Response(object.body).arrayBuffer())] as const;
      }),
    );
    for (const entry of read) {
      if (!entry) continue;
      total += entry[1].byteLength;
      if (total > MAX_DRAWING_BINARY_BYTES) {
        throw fail(
          "request.invalid",
          "The images and fonts this project uses weigh more than 24 MiB: they cannot be drawn on the server.",
        );
      }
      out[entry[0]] = entry[1];
    }
  }
  return out;
}

/**
 * The project's renderer objects, each call of which, when the object cannot answer (its CPU limit
 * exceeded, overloaded, reset), throws `renderer.unavailable` (`mcp-previews`, "An unavailable
 * renderer"): the agent is told the work can run on the person's machine with `mdg mcp`, and a write
 * whose check could not run pushes nothing. The object's own refusals are answers, not throws.
 */
export function renderersOf(op: OpCtx): RenderersApi {
  const renderers = op.deps.renderers;
  if (!renderers) throw fail("internal");
  const guard = <T>(call: () => Promise<T>): Promise<T> =>
    call().catch((error: unknown) => {
      throw error instanceof ApiError ? error : fail("renderer.unavailable");
    });
  return {
    render: (projectId, request) => guard(() => renderers.render(projectId, request)),
    validate: (projectId, request) => guard(() => renderers.validate(projectId, request)),
    catalog: (projectId, request) => guard(() => renderers.catalog(projectId, request)),
    stats: (projectId) => guard(() => renderers.stats(projectId)),
  };
}
