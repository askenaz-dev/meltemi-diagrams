// The permissions an owner or an administrator grants to an account (`service-administration`,
// "Permissions"): a catalog in code, each entry over its own columns of `users`. Owners and
// administrators hold every permission without a grant; a row says only what was set on it.

import type { AdminLogEntry, CloudStore, Iso, User } from "./store/types.js";

/** One permission: its id, and how it is read, set and listed in the store. */
export interface Permission {
  readonly id: string;
  /** Whether the person's row holds it, who last set it and when. */
  read(user: User): {
    readonly granted: boolean;
    readonly by: string | null;
    readonly at: Iso | null;
  };
  /** Grants or revokes it, with its log entry: `"missing"` for a person with no row. */
  set(
    store: CloudStore,
    sub: string,
    granted: boolean,
    by: string,
    at: Iso,
    log: AdminLogEntry,
  ): Promise<"set" | "missing">;
  /** The people whose row holds it, the earliest grant first. */
  holders(store: CloudStore): Promise<User[]>;
}

/** Export without the Meltemi branding: the columns of migration 0005 (`unbranded-exports`). */
const UNBRANDED_EXPORTS: Permission = {
  id: "unbranded-exports",
  read: (user) => ({
    granted: user.unbrandedExports,
    by: user.unbrandedExportsBy,
    at: user.unbrandedExportsAt,
  }),
  set: (store, sub, granted, by, at, log) => store.setUnbrandedExports(sub, granted, by, at, log),
  holders: (store) => store.entitledUsers(),
};

/** The catalog, in the order the account panel lists it. */
export const PERMISSIONS: readonly Permission[] = [UNBRANDED_EXPORTS];

/** The permission with that id, or undefined. */
export function permissionOf(id: string): Permission | undefined {
  return PERMISSIONS.find((permission) => permission.id === id);
}
