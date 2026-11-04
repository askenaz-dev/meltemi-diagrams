// The part of the CloudStore contract that belongs to the projects (change cloud-projects):
// projects and their owner check, thumbnails, the files a materialisation writes, blobs and
// `project_blobs`, versions, usage, the collection of blobs, the cascade of a person's deletion
// and the races of all of them. It is run by `runStoreConformance` (conformance.ts) over every
// implementation, like the rest of the contract.

import { beforeEach, describe, expect, it } from "vitest";
import type {
  CloudStore,
  Iso,
  NewBlob,
  NewProject,
  NewVersion,
  Version,
  VersionGuard,
} from "../../src/store/types.js";
import { DAY, HOUR, MINUTE, SECOND, at, present, sha } from "./fixtures.js";

/** The quota of an account; the store takes it as a number from its caller. */
const PROJECTS = 100;

/** The id of the `n`th project: 20 characters of [0-9a-z], as the address of a project is. */
const pid = (n: number): string => `proj${String(n).padStart(16, "0")}`;

const aProject = (n: number, over: Partial<NewProject> = {}): NewProject => ({
  id: pid(n),
  ownerSub: "u1",
  name: `Project ${n}`,
  description: `About project ${n}`,
  createdAt: at(n * SECOND),
  ...over,
});

/** The hash of the blob called `label`. */
const bh = (label: string): string => sha(`blob/${label}`);

const aBlob = (label: string, over: Partial<NewBlob> = {}): NewBlob => ({
  hash: bh(label),
  size: 100,
  mediaType: "text/plain",
  ...over,
});

/** No condition that could refuse a version: the cap is far away. */
const OPEN: VersionGuard = { maxVersions: 1000 };

/** Files as the store keeps them: path to the hash of the blob called by the label. */
const hashed = (entries: Record<string, string>): Map<string, string> =>
  new Map(Object.entries(entries).map(([path, label]) => [path, bh(label)]));

export function defineProjectConformance(get: () => CloudStore): void {
  describe("projects and what they hold", () => {
    let store: CloudStore;

    beforeEach(() => {
      store = get();
    });

    /** Creates the `n`th project and answers it as the store has it. */
    const makeProject = async (n: number, over: Partial<NewProject> = {}) => {
      const project = aProject(n, over);
      expect(await store.createProject(project, PROJECTS)).toBe("created");
      return present(await store.project(project.ownerSub, project.id));
    };

    /**
     * Materialises: sets the project's files to exactly `entries` (path to blob label), writing
     * only what differs from the files it has, and registers each blob as `size` bytes.
     */
    const setFiles = async (
      projectId: string,
      entries: Record<string, string>,
      over: { size?: number; now?: Iso; revision?: number } = {},
    ) => {
      const current = await store.projectFiles(projectId);
      const next = hashed(entries);
      const upserts = new Map([...next].filter(([path, hash]) => current.get(path) !== hash));
      const deletes = [...current.keys()].filter((path) => !next.has(path));
      const blobs = Object.values(entries).map((label) => aBlob(label, { size: over.size ?? 10 }));
      const written = await store.applyMaterialisation({
        projectId,
        upserts,
        deletes,
        blobs,
        revision: over.revision ?? 1,
        now: over.now ?? at(HOUR),
      });
      expect(written, `materialising ${projectId}`).toBe(true);
    };

    /** Records a version of the project and answers it. */
    const snapshot = async (
      projectId: string,
      over: Partial<NewVersion> = {},
      guard: VersionGuard = OPEN,
    ): Promise<Version> => {
      const made = await store.createVersion(
        { projectId, label: null, auto: false, createdBy: "u1", createdAt: at(HOUR), ...over },
        guard,
      );
      if (typeof made === "string") throw new Error(`the version was refused: ${made}`);
      return made;
    };

    /** A person with a row, so that their usage can be stored. */
    const person = (sub: string) =>
      store.upsertUser(
        {
          sub,
          name: `Person ${sub}`,
          picture: "",
          email: `${sub}@example.com`,
          emailVerified: true,
        },
        at(0),
      );

    // ---------------------------------------------------------------------------------------

    describe("projects", () => {
      it("creates a project and reads it back whole", async () => {
        expect(await store.createProject(aProject(1), PROJECTS)).toBe("created");
        expect(await store.project("u1", pid(1))).toEqual({
          id: pid(1),
          ownerSub: "u1",
          name: "Project 1",
          description: "About project 1",
          createdAt: at(SECOND),
          updatedAt: at(SECOND),
          revision: 0,
          thumbnailAt: null,
          linkAccess: "private",
        });
      });

      it("is the owner's alone: anyone else, and an id that merely looks the same, get undefined", async () => {
        await makeProject(1);
        expect(await store.project("u2", pid(1))).toBeUndefined();
        expect(await store.project("U1", pid(1))).toBeUndefined();
        expect(await store.project("u1 ", pid(1))).toBeUndefined();
        expect(await store.project("", pid(1))).toBeUndefined();
        expect(await store.project("u1' OR '1'='1", pid(1))).toBeUndefined();
        for (const lookalike of [
          pid(1).toUpperCase(),
          pid(1).slice(0, 19),
          `${pid(1)}0`,
          pid(2),
          "",
          "%",
          "proj%",
        ]) {
          expect(await store.project("u1", lookalike), lookalike).toBeUndefined();
        }
        expect((await store.project("u1", pid(1)))?.name).toBe("Project 1");
      });

      it("keeps text exactly as given: quotes, markup, SQL, emoji, newlines and empty text", async () => {
        const odd = aProject(1, {
          ownerSub: "Robert'); DROP TABLE projects;--",
          name: "<b>x</b> \"q\" 'a'); DROP TABLE projects;-- \n ñ 🌊",
          description: "",
        });
        expect(await store.createProject(odd, PROJECTS)).toBe("created");
        expect(await store.project(odd.ownerSub, odd.id)).toMatchObject({
          ownerSub: odd.ownerSub,
          name: odd.name,
          description: "",
        });
        expect(await store.countProjects(odd.ownerSub)).toBe(1);
      });

      it("refuses a second project with the same id, whoever owns it, and keeps the first", async () => {
        await makeProject(1);
        await expect(
          store.createProject(aProject(1, { ownerSub: "u2", name: "Other" }), PROJECTS),
        ).rejects.toThrow();
        await expect(store.createProject(aProject(1), PROJECTS)).rejects.toThrow();
        expect((await store.project("u1", pid(1)))?.name).toBe("Project 1");
        expect(await store.project("u2", pid(1))).toBeUndefined();
        expect(await store.countProjects("u2")).toBe(0);
        expect(await store.countProjects("u1")).toBe(1);
      });

      describe("the quota", () => {
        it("stores projects up to the limit and refuses the next, storing nothing for it", async () => {
          for (const n of [1, 2, 3])
            expect(await store.createProject(aProject(n), 3)).toBe("created");
          expect(await store.createProject(aProject(4), 3)).toBe("quota");
          expect(await store.project("u1", pid(4))).toBeUndefined();
          expect(await store.countProjects("u1")).toBe(3);
          // A refusal does not wear out.
          expect(await store.createProject(aProject(5), 3)).toBe("quota");
          expect(await store.countProjects("u1")).toBe(3);
        });

        it("allows exactly 100 projects, the account's limit, and refuses the 101st", async () => {
          for (let n = 1; n <= PROJECTS; n++) {
            expect(await store.createProject(aProject(n), PROJECTS), `project ${n}`).toBe(
              "created",
            );
          }
          expect(await store.createProject(aProject(PROJECTS + 1), PROJECTS)).toBe("quota");
          expect(await store.countProjects("u1")).toBe(PROJECTS);
          expect(await store.listProjects("u1")).toHaveLength(PROJECTS);
        });

        it("counts per person: one at the limit does not stop another, and a sub that merely starts the same is another", async () => {
          for (const n of [1, 2]) await store.createProject(aProject(n), 2);
          expect(await store.createProject(aProject(3), 2)).toBe("quota");
          expect(await store.createProject(aProject(4, { ownerSub: "u2" }), 2)).toBe("created");
          expect(await store.createProject(aProject(5, { ownerSub: "u1-and-more" }), 2)).toBe(
            "created",
          );
          expect(await store.createProject(aProject(6, { ownerSub: "U1" }), 2)).toBe("created");
          expect(await store.countProjects("u1")).toBe(2);
          expect(await store.countProjects("u2")).toBe(1);
        });

        it("gives a place back when a project is deleted", async () => {
          for (const n of [1, 2]) await store.createProject(aProject(n), 2);
          expect(await store.createProject(aProject(3), 2)).toBe("quota");
          expect(await store.deleteProject("u1", pid(1))).toBe(true);
          expect(await store.createProject(aProject(3), 2)).toBe("created");
          expect(await store.createProject(aProject(4), 2)).toBe("quota");
        });

        it.each([
          ["zero", "quota", 0],
          ["a negative number", "quota", -1],
          ["not a number", "quota", Number.NaN],
          ["infinity", "created", Number.POSITIVE_INFINITY],
        ] as const)(
          "a limit of %s gives %s to a person with no projects",
          async (_label, expected, limit) => {
            expect(await store.createProject(aProject(1), limit)).toBe(expected);
            expect(await store.countProjects("u1")).toBe(expected === "created" ? 1 : 0);
          },
        );

        it("uses the limit it is given each time, not one it remembers", async () => {
          for (const n of [1, 2]) await store.createProject(aProject(n), 2);
          expect(await store.createProject(aProject(3), 2)).toBe("quota");
          expect(await store.createProject(aProject(3), 3)).toBe("created");
          expect(await store.createProject(aProject(4), 3)).toBe("quota");
        });

        it("answers quota, not an error, to a person at the limit even when the id would collide", async () => {
          for (const n of [1, 2]) await store.createProject(aProject(n), 2);
          expect(await store.createProject(aProject(1), 2)).toBe("quota");
          expect(await store.countProjects("u1")).toBe(2);
        });
      });

      describe("listing", () => {
        it("lists the most recently updated first, not the last created", async () => {
          for (const n of [1, 2, 3]) await makeProject(n);
          expect((await store.listProjects("u1")).map((p) => p.id)).toEqual([
            pid(3),
            pid(2),
            pid(1),
          ]);
          await setFiles(pid(1), { a: "x" }, { now: at(DAY) });
          await setFiles(pid(2), { a: "x" }, { now: at(HOUR) });
          expect((await store.listProjects("u1")).map((p) => p.id)).toEqual([
            pid(1),
            pid(2),
            pid(3),
          ]);
        });

        it("puts the project stored later first when several were updated at the same instant", async () => {
          for (const n of [1, 2, 3]) await makeProject(n, { createdAt: at(SECOND) });
          expect((await store.listProjects("u1")).map((p) => p.id)).toEqual([
            pid(3),
            pid(2),
            pid(1),
          ]);
          await setFiles(pid(1), { a: "x" }, { now: at(SECOND) });
          await setFiles(pid(2), { a: "x" }, { now: at(SECOND) });
          expect((await store.listProjects("u1")).map((p) => p.id)).toEqual([
            pid(3),
            pid(2),
            pid(1),
          ]);
        });

        it("lists only the person's projects, each whole, with the time of its thumbnail", async () => {
          await makeProject(1);
          await makeProject(2, { ownerSub: "u2" });
          await makeProject(3);
          await store.claimThumbnail(pid(1), at(MINUTE), at(0));
          expect(await store.listProjects("u1")).toEqual([
            {
              id: pid(3),
              ownerSub: "u1",
              name: "Project 3",
              description: "About project 3",
              createdAt: at(3 * SECOND),
              updatedAt: at(3 * SECOND),
              revision: 0,
              thumbnailAt: null,
              linkAccess: "private",
              role: "owner",
            },
            {
              id: pid(1),
              ownerSub: "u1",
              name: "Project 1",
              description: "About project 1",
              createdAt: at(SECOND),
              updatedAt: at(SECOND),
              revision: 0,
              thumbnailAt: at(MINUTE),
              linkAccess: "private",
              role: "owner",
            },
          ]);
          expect((await store.listProjects("u2")).map((p) => p.id)).toEqual([pid(2)]);
          for (const nobody of ["nobody", "", "u", "%", "U1"]) {
            expect(await store.listProjects(nobody), nobody).toEqual([]);
          }
        });

        it("counts a person's projects and lists their ids, the oldest first, for that person alone", async () => {
          for (const n of [3, 1, 2]) await makeProject(n);
          await makeProject(4, { ownerSub: "u2" });
          expect(await store.countProjects("u1")).toBe(3);
          expect(await store.countProjects("u2")).toBe(1);
          expect(await store.countProjects("nobody")).toBe(0);
          expect(await store.projectIdsOf("u1")).toEqual([pid(3), pid(1), pid(2)]);
          expect(await store.projectIdsOf("u2")).toEqual([pid(4)]);
          expect(await store.projectIdsOf("nobody")).toEqual([]);
          expect(await store.projectIdsOf("")).toEqual([]);
        });

        it("names the owner of a project for the room, which has no person", async () => {
          await makeProject(1);
          await makeProject(2, { ownerSub: "u2" });
          expect(await store.ownerOf(pid(1))).toBe("u1");
          expect(await store.ownerOf(pid(2))).toBe("u2");
          expect(await store.ownerOf(pid(3))).toBeUndefined();
          expect(await store.ownerOf("")).toBeUndefined();
        });

        it("hands out copies: changing a result does not change the store", async () => {
          await makeProject(1);
          const one = present(await store.project("u1", pid(1)));
          (one as { name: string }).name = "changed outside";
          const [listed] = await store.listProjects("u1");
          (present(listed) as { name: string }).name = "changed too";
          expect((await store.project("u1", pid(1)))?.name).toBe("Project 1");
          expect((await store.listProjects("u1"))[0]?.name).toBe("Project 1");
        });
      });

      describe("renaming and describing", () => {
        it("sets the name and the description and the time, and keeps the rest", async () => {
          await makeProject(1);
          await store.claimThumbnail(pid(1), at(MINUTE), at(0));
          await setFiles(pid(1), { a: "x" }, { revision: 7, now: at(2 * MINUTE) });
          const updated = await store.updateProject(
            "u1",
            pid(1),
            { name: "Renamed", description: "New text" },
            at(HOUR),
          );
          expect(updated).toEqual({
            id: pid(1),
            ownerSub: "u1",
            name: "Renamed",
            description: "New text",
            createdAt: at(SECOND),
            updatedAt: at(HOUR),
            revision: 7,
            thumbnailAt: at(MINUTE),
            linkAccess: "private",
          });
          expect(await store.project("u1", pid(1))).toEqual(updated);
        });

        it("changes only the field given, and an empty description is a description", async () => {
          await makeProject(1);
          expect(
            (await store.updateProject("u1", pid(1), { name: "Only name" }, at(HOUR)))?.description,
          ).toBe("About project 1");
          const described = await store.updateProject(
            "u1",
            pid(1),
            { description: "" },
            at(2 * HOUR),
          );
          expect(described).toMatchObject({
            name: "Only name",
            description: "",
            updatedAt: at(2 * HOUR),
          });
        });

        it("writes nothing for an empty patch, not even the time", async () => {
          const before = await makeProject(1);
          expect(await store.updateProject("u1", pid(1), {}, at(DAY))).toEqual(before);
          expect(await store.project("u1", pid(1))).toEqual(before);
          expect(await store.updateProject("u1", pid(2), {}, at(DAY))).toBeUndefined();
          expect(await store.updateProject("u2", pid(1), {}, at(DAY))).toBeUndefined();
        });

        it("refuses a project that is someone else's or does not exist, and changes nothing", async () => {
          const before = await makeProject(1);
          expect(
            await store.updateProject("u2", pid(1), { name: "Mine now" }, at(DAY)),
          ).toBeUndefined();
          expect(
            await store.updateProject("", pid(1), { name: "Mine now" }, at(DAY)),
          ).toBeUndefined();
          expect(
            await store.updateProject("u1", pid(9), { name: "Nothing" }, at(DAY)),
          ).toBeUndefined();
          expect(
            await store.updateProject("U1", pid(1), { name: "Case" }, at(DAY)),
          ).toBeUndefined();
          expect(await store.project("u1", pid(1))).toEqual(before);
          expect(await store.project("u2", pid(9))).toBeUndefined();
        });

        it("keeps text exactly as given and treats SQL as the text it is", async () => {
          await makeProject(1);
          const name = "<b>x</b> \"q\" 'a'); DROP TABLE projects;-- \n ñ 🌊";
          const updated = await store.updateProject(
            "u1' OR '1'='1",
            pid(1),
            { name, description: name },
            at(HOUR),
          );
          expect(updated).toBeUndefined();
          expect(
            await store.updateProject("u1", pid(1), { name, description: name }, at(HOUR)),
          ).toMatchObject({ name, description: name });
        });

        it("moves the project to the top of the list", async () => {
          for (const n of [1, 2, 3]) await makeProject(n);
          await store.updateProject("u1", pid(1), { name: "Renamed" }, at(HOUR));
          expect((await store.listProjects("u1")).map((p) => p.id)).toEqual([
            pid(1),
            pid(3),
            pid(2),
          ]);
        });
      });

      describe("deleting", () => {
        /** A project with files, an upload and two versions. */
        const fill = async (n: number, sub = "u1") => {
          await makeProject(n, { ownerSub: sub });
          await setFiles(pid(n), { "a.meltemi": "alpha", "b.meltemi": "beta" });
          await store.addBlobs([aBlob("logo", { mediaType: "image/png" })], at(HOUR));
          expect(await store.addProjectBlob(pid(n), bh("logo"))).toBe(true);
          await snapshot(pid(n), { createdBy: sub });
          await setFiles(pid(n), { "a.meltemi": "alpha2" });
          await snapshot(pid(n), { createdBy: sub, label: "second" });
        };

        const holds = async (n: number) => ({
          files: (await store.projectFiles(pid(n))).size,
          uploads: (await store.projectBlobs(pid(n))).length,
          versions: (await store.listVersions(pid(n))).length,
          firstVersion: await store.versionFiles(pid(n), 1),
        });

        it("removes the project with its files, uploads, versions and their files, and says so", async () => {
          await fill(1);
          expect(await holds(1)).toMatchObject({ files: 1, uploads: 1, versions: 2 });
          expect(await store.deleteProject("u1", pid(1))).toBe(true);
          expect(await store.project("u1", pid(1))).toBeUndefined();
          expect(await store.listProjects("u1")).toEqual([]);
          expect(await holds(1)).toEqual({
            files: 0,
            uploads: 0,
            versions: 0,
            firstVersion: undefined,
          });
          expect(await store.ownerOf(pid(1))).toBeUndefined();
          expect(await store.latestVersion(pid(1))).toBeUndefined();
          expect(await store.countVersions(pid(1))).toBe(0);
        });

        it("leaves everything else alone: other projects, other people's, and the blobs", async () => {
          await fill(1);
          await fill(2);
          await fill(3, "u2");
          const kept = await Promise.all([holds(2), holds(3)]);
          expect(await store.deleteProject("u1", pid(1))).toBe(true);
          expect(await Promise.all([holds(2), holds(3)])).toEqual(kept);
          expect((await store.listProjects("u1")).map((p) => p.id)).toEqual([pid(2)]);
          expect((await store.listProjects("u2")).map((p) => p.id)).toEqual([pid(3)]);
          // The blobs are shared by content and wait for the collection.
          expect(await store.blobsPresent([bh("alpha"), bh("logo"), bh("alpha2")])).toEqual(
            new Set([bh("alpha"), bh("logo"), bh("alpha2")]),
          );
        });

        it("refuses a project that is someone else's: false, and nothing is removed", async () => {
          await fill(1);
          const before = await holds(1);
          expect(await store.deleteProject("u2", pid(1))).toBe(false);
          expect(await store.deleteProject("", pid(1))).toBe(false);
          expect(await store.deleteProject("U1", pid(1))).toBe(false);
          expect(await store.deleteProject("u1' OR '1'='1", pid(1))).toBe(false);
          expect(await holds(1)).toEqual(before);
          expect((await store.project("u1", pid(1)))?.name).toBe("Project 1");
        });

        it("answers false for a project that does not exist and for a second deletion", async () => {
          await makeProject(1);
          expect(await store.deleteProject("u1", pid(2))).toBe(false);
          expect(await store.deleteProject("u1", "")).toBe(false);
          expect(await store.deleteProject("u1", "%")).toBe(false);
          expect(await store.deleteProject("u1", pid(1))).toBe(true);
          expect(await store.deleteProject("u1", pid(1))).toBe(false);
        });

        it("leaves nothing a late write could hang on it: every write for the gone project is refused", async () => {
          await fill(1);
          await store.deleteProject("u1", pid(1));
          expect(await store.addProjectBlob(pid(1), bh("logo"))).toBe(false);
          expect(
            await store.applyMaterialisation({
              projectId: pid(1),
              upserts: hashed({ "late.meltemi": "late" }),
              deletes: [],
              blobs: [aBlob("late")],
              revision: 9,
              now: at(DAY),
            }),
          ).toBe(false);
          expect(
            await store.createVersion(
              { projectId: pid(1), label: null, auto: false, createdBy: "u1", createdAt: at(DAY) },
              OPEN,
            ),
          ).toBe("missing");
          expect(await store.claimThumbnail(pid(1), at(DAY), at(0))).toBe(false);
          await store.setThumbnailAt(pid(1), at(DAY));
          expect(await holds(1)).toEqual({
            files: 0,
            uploads: 0,
            versions: 0,
            firstVersion: undefined,
          });
          expect(await store.project("u1", pid(1))).toBeUndefined();
        });

        it("lets the id be used again by a project that has nothing of the old one", async () => {
          await fill(1);
          await store.deleteProject("u1", pid(1));
          await makeProject(1, { ownerSub: "u2", name: "Fresh" });
          expect(await holds(1)).toEqual({
            files: 0,
            uploads: 0,
            versions: 0,
            firstVersion: undefined,
          });
          expect((await store.project("u2", pid(1)))?.name).toBe("Fresh");
          expect(await store.project("u1", pid(1))).toBeUndefined();
        });
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("thumbnails", () => {
      it("records the first thumbnail of a project and shows its time", async () => {
        await makeProject(1);
        expect(await store.claimThumbnail(pid(1), at(MINUTE), at(MINUTE - 30 * SECOND))).toBe(true);
        expect((await store.project("u1", pid(1)))?.thumbnailAt).toBe(at(MINUTE));
      });

      it("refuses a second one inside the limit and keeps the first", async () => {
        await makeProject(1);
        // The limit is thirty seconds: a claim at `now` passes `now - 30 s` as the newest
        // thumbnail it accepts to replace.
        const claim = (ms: number) => store.claimThumbnail(pid(1), at(ms), at(ms - 30 * SECOND));
        const written = async () => (await store.project("u1", pid(1)))?.thumbnailAt;
        expect(await claim(MINUTE)).toBe(true);
        expect(await claim(MINUTE + 10 * SECOND)).toBe(false);
        expect(await written()).toBe(at(MINUTE));
        // Exactly thirty seconds later the first is as old as the limit and may be replaced.
        expect(await claim(MINUTE + 30 * SECOND)).toBe(true);
        expect(await written()).toBe(at(MINUTE + 30 * SECOND));
        expect(await claim(MINUTE + 60 * SECOND - 1)).toBe(false);
        expect(await written()).toBe(at(MINUTE + 30 * SECOND));
      });

      it("lets a thumbnail exactly as old as the limit be replaced, and one a millisecond newer not", async () => {
        await makeProject(1);
        await store.setThumbnailAt(pid(1), at(MINUTE));
        expect(await store.claimThumbnail(pid(1), at(2 * MINUTE), at(MINUTE - 1))).toBe(false);
        expect((await store.project("u1", pid(1)))?.thumbnailAt).toBe(at(MINUTE));
        expect(await store.claimThumbnail(pid(1), at(2 * MINUTE), at(MINUTE))).toBe(true);
        expect((await store.project("u1", pid(1)))?.thumbnailAt).toBe(at(2 * MINUTE));
      });

      it("puts the time back as it was, null included, when the write failed", async () => {
        await makeProject(1);
        expect(await store.claimThumbnail(pid(1), at(MINUTE), at(0))).toBe(true);
        await store.setThumbnailAt(pid(1), null);
        expect((await store.project("u1", pid(1)))?.thumbnailAt).toBeNull();
        expect(await store.claimThumbnail(pid(1), at(MINUTE + SECOND), at(MINUTE))).toBe(true);
        await store.setThumbnailAt(pid(1), at(5));
        expect((await store.project("u1", pid(1)))?.thumbnailAt).toBe(at(5));
      });

      it("counts per project and answers false for one that does not exist", async () => {
        await makeProject(1);
        await makeProject(2, { ownerSub: "u2" });
        await store.claimThumbnail(pid(1), at(MINUTE), at(0));
        expect(await store.claimThumbnail(pid(2), at(MINUTE), at(0))).toBe(true);
        expect(await store.claimThumbnail(pid(3), at(MINUTE), at(0))).toBe(false);
        await expect(store.setThumbnailAt(pid(3), at(MINUTE))).resolves.toBeUndefined();
        expect((await store.project("u2", pid(2)))?.thumbnailAt).toBe(at(MINUTE));
      });

      it("does not touch the project's updated time, so the list does not reorder", async () => {
        await makeProject(1);
        await makeProject(2);
        await store.claimThumbnail(pid(1), at(DAY), at(0));
        expect((await store.project("u1", pid(1)))?.updatedAt).toBe(at(SECOND));
        expect((await store.listProjects("u1")).map((p) => p.id)).toEqual([pid(2), pid(1)]);
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("files and materialisation", () => {
      it("has no files for a project that has not been materialised, or that does not exist", async () => {
        await makeProject(1);
        expect(await store.projectFiles(pid(1))).toEqual(new Map());
        expect(await store.projectFiles(pid(2))).toEqual(new Map());
        expect(await store.projectFiles("")).toEqual(new Map());
      });

      it("writes the upserts, the deletions, the revision and the time, and says the project is there", async () => {
        await makeProject(1);
        await store.applyMaterialisation({
          projectId: pid(1),
          upserts: hashed({ "a.meltemi": "a1", "b.meltemi": "b1", "c.json": "c1" }),
          deletes: [],
          blobs: [aBlob("a1"), aBlob("b1"), aBlob("c1")],
          revision: 4,
          now: at(HOUR),
        });
        expect(await store.projectFiles(pid(1))).toEqual(
          hashed({ "a.meltemi": "a1", "b.meltemi": "b1", "c.json": "c1" }),
        );
        expect(await store.project("u1", pid(1))).toMatchObject({
          revision: 4,
          updatedAt: at(HOUR),
          name: "Project 1",
          description: "About project 1",
          createdAt: at(SECOND),
        });

        const second = await store.applyMaterialisation({
          projectId: pid(1),
          upserts: hashed({ "b.meltemi": "b2", "d.md": "d1" }),
          deletes: ["a.meltemi"],
          blobs: [aBlob("b2"), aBlob("d1")],
          revision: 9,
          now: at(2 * HOUR),
        });
        expect(second).toBe(true);
        expect(await store.projectFiles(pid(1))).toEqual(
          hashed({ "b.meltemi": "b2", "c.json": "c1", "d.md": "d1" }),
        );
        expect(await store.project("u1", pid(1))).toMatchObject({
          revision: 9,
          updatedAt: at(2 * HOUR),
        });
      });

      it("leaves the revision and the time as they are when it is given the revision the project has: no change, no move up the list", async () => {
        await makeProject(1);
        const apply = (revision: number, now: string) =>
          store.applyMaterialisation({
            projectId: pid(1),
            upserts: hashed({ "a.meltemi": "a1" }),
            deletes: [],
            blobs: [aBlob("a1")],
            revision,
            now,
          });
        expect(await apply(4, at(HOUR))).toBe(true);

        // A room built again over what it already materialised, and a person who only looked.
        expect(await apply(4, at(5 * HOUR))).toBe(true);
        expect(await store.project("u1", pid(1))).toMatchObject({
          revision: 4,
          updatedAt: at(HOUR),
        });

        // A revision the project does not have yet is a change, whichever way it goes.
        expect(await apply(5, at(6 * HOUR))).toBe(true);
        expect(await store.project("u1", pid(1))).toMatchObject({
          revision: 5,
          updatedAt: at(6 * HOUR),
        });
        // And it still says a project that is not there is not.
        expect(
          await store.applyMaterialisation({
            projectId: pid(9),
            upserts: new Map(),
            deletes: [],
            blobs: [],
            revision: 5,
            now: at(7 * HOUR),
          }),
        ).toBe(false);
      });

      it("registers the blobs it is given", async () => {
        await makeProject(1);
        await store.applyMaterialisation({
          projectId: pid(1),
          upserts: hashed({ "a.meltemi": "a1" }),
          deletes: [],
          blobs: [aBlob("a1", { size: 123, mediaType: "text/x-meltemi" })],
          revision: 1,
          now: at(HOUR),
        });
        expect(await store.blob(bh("a1"))).toEqual({
          hash: bh("a1"),
          size: 123,
          mediaType: "text/x-meltemi",
          createdAt: at(HOUR),
        });
      });

      it("writes only the revision and the time when there is nothing else to write", async () => {
        await makeProject(1);
        await setFiles(pid(1), { a: "a1" });
        const written = await store.applyMaterialisation({
          projectId: pid(1),
          upserts: new Map(),
          deletes: [],
          blobs: [],
          revision: 12,
          now: at(DAY),
        });
        expect(written).toBe(true);
        expect(await store.projectFiles(pid(1))).toEqual(hashed({ a: "a1" }));
        expect(await store.project("u1", pid(1))).toMatchObject({
          revision: 12,
          updatedAt: at(DAY),
        });
      });

      it("leaves a path alone that is given with the hash it already has, and a delete of a path that is not there harmless", async () => {
        await makeProject(1);
        await setFiles(pid(1), { a: "a1", b: "b1" });
        await store.applyMaterialisation({
          projectId: pid(1),
          upserts: hashed({ a: "a1" }),
          deletes: ["nothing-here"],
          blobs: [],
          revision: 2,
          now: at(2 * HOUR),
        });
        expect(await store.projectFiles(pid(1))).toEqual(hashed({ a: "a1", b: "b1" }));
      });

      it("ends with a path that is both deleted and upserted upserted", async () => {
        await makeProject(1);
        await setFiles(pid(1), { a: "a1" });
        await store.applyMaterialisation({
          projectId: pid(1),
          upserts: hashed({ a: "a2" }),
          deletes: ["a"],
          blobs: [aBlob("a2")],
          revision: 2,
          now: at(2 * HOUR),
        });
        expect(await store.projectFiles(pid(1))).toEqual(hashed({ a: "a2" }));
      });

      it("writes 250 changed paths and 250 deleted ones, however they are cut up inside", async () => {
        await makeProject(1);
        const path = (i: number) => `diagrams/part-${String(i).padStart(3, "0")}.meltemi`;
        const first = Array.from({ length: 500 }, (_, i) => [path(i), `v1-${i}`] as const);
        await store.applyMaterialisation({
          projectId: pid(1),
          upserts: new Map(first.map(([p, label]) => [p, bh(label)])),
          deletes: [],
          blobs: first.map(([, label]) => aBlob(label)),
          revision: 1,
          now: at(HOUR),
        });
        expect((await store.projectFiles(pid(1))).size).toBe(500);

        // 250 paths change, 250 more go: 0..249 changed, 250..499 deleted.
        const second = Array.from({ length: 250 }, (_, i) => [path(i), `v2-${i}`] as const);
        await store.applyMaterialisation({
          projectId: pid(1),
          upserts: new Map(second.map(([p, label]) => [p, bh(label)])),
          deletes: Array.from({ length: 250 }, (_, i) => path(250 + i)),
          blobs: second.map(([, label]) => aBlob(label)),
          revision: 2,
          now: at(2 * HOUR),
        });
        const files = await store.projectFiles(pid(1));
        expect(files.size).toBe(250);
        for (const [p, label] of second) expect(files.get(p), p).toBe(bh(label));
        expect(files.has(path(250))).toBe(false);
        expect(files.has(path(499))).toBe(false);
        expect((await store.blobsPresent(second.map(([, label]) => bh(label)))).size).toBe(250);
      });

      it("keeps awkward paths as they are: a name Object has, quotes, SQL, emoji, spaces and a long path", async () => {
        await makeProject(1);
        const paths = [
          "__proto__",
          "constructor",
          "toString",
          'it\'s "quoted".meltemi',
          "x'); DROP TABLE project_files;--",
          "ñ/🌊 wave.meltemi",
          "with space/and%percent_underscore.md",
          `deep/${"d".repeat(100)}/${"e".repeat(100)}.json`,
        ];
        await store.applyMaterialisation({
          projectId: pid(1),
          upserts: new Map(paths.map((p, i) => [p, bh(`file-${i}`)])),
          deletes: [],
          blobs: paths.map((_, i) => aBlob(`file-${i}`)),
          revision: 1,
          now: at(HOUR),
        });
        const files = await store.projectFiles(pid(1));
        expect([...files.keys()].sort()).toEqual([...paths].sort());
        for (const [i, p] of paths.entries()) expect(files.get(p), p).toBe(bh(`file-${i}`));
        await store.applyMaterialisation({
          projectId: pid(1),
          upserts: new Map(),
          deletes: ["__proto__", "x'); DROP TABLE project_files;--"],
          blobs: [],
          revision: 2,
          now: at(2 * HOUR),
        });
        expect((await store.projectFiles(pid(1))).size).toBe(paths.length - 2);
      });

      it("keeps each project's files to itself, a path that is in both included", async () => {
        await makeProject(1);
        await makeProject(2, { ownerSub: "u2" });
        await setFiles(pid(1), { "same.meltemi": "one", "only1.md": "x" });
        await setFiles(pid(2), { "same.meltemi": "two" });
        await store.applyMaterialisation({
          projectId: pid(1),
          upserts: new Map(),
          deletes: ["same.meltemi"],
          blobs: [],
          revision: 3,
          now: at(2 * HOUR),
        });
        expect(await store.projectFiles(pid(1))).toEqual(hashed({ "only1.md": "x" }));
        expect(await store.projectFiles(pid(2))).toEqual(hashed({ "same.meltemi": "two" }));
        expect((await store.project("u2", pid(2)))?.revision).toBe(1);
      });

      it("says false for a project that is not there, writes nothing for it, and still registers the blobs", async () => {
        const written = await store.applyMaterialisation({
          projectId: pid(1),
          upserts: hashed({ a: "a1" }),
          deletes: ["b"],
          blobs: [aBlob("a1")],
          revision: 1,
          now: at(HOUR),
        });
        expect(written).toBe(false);
        expect(await store.projectFiles(pid(1))).toEqual(new Map());
        expect(await store.listProjects("u1")).toEqual([]);
        // The blobs are global and wait for the collection if nothing ever references them.
        expect((await store.blob(bh("a1")))?.createdAt).toBe(at(HOUR));
      });

      it("can be repeated: the same materialisation twice leaves what the first left", async () => {
        await makeProject(1);
        const one = {
          projectId: pid(1),
          upserts: hashed({ a: "a1", b: "b1" }),
          deletes: ["gone"],
          blobs: [aBlob("a1"), aBlob("b1")],
          revision: 3,
          now: at(HOUR),
        };
        await store.applyMaterialisation(one);
        const after = await Promise.all([store.projectFiles(pid(1)), store.project("u1", pid(1))]);
        await store.applyMaterialisation(one);
        expect(
          await Promise.all([store.projectFiles(pid(1)), store.project("u1", pid(1))]),
        ).toEqual(after);
      });

      it("hands out a copy of the files: changing it does not change the store", async () => {
        await makeProject(1);
        await setFiles(pid(1), { a: "a1" });
        (await store.projectFiles(pid(1))).set("injected", bh("x"));
        expect(await store.projectFiles(pid(1))).toEqual(hashed({ a: "a1" }));
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("blobs", () => {
      it("says which of the hashes have a row, any number of them", async () => {
        const labels = Array.from({ length: 250 }, (_, i) => `blob-${i}`);
        await store.addBlobs(
          labels.filter((_, i) => i % 3 === 0).map((label) => aBlob(label)),
          at(HOUR),
        );
        const found = await store.blobsPresent([...labels.map(bh), bh("never"), bh("blob-0")]);
        expect(found).toEqual(new Set(labels.filter((_, i) => i % 3 === 0).map(bh)));
        expect(await store.blobsPresent([])).toEqual(new Set());
        expect(await store.blobsPresent([bh("never")])).toEqual(new Set());
        // A hash is matched whole: case, length and text that looks like a pattern are not it.
        const hash = bh("blob-0");
        expect(
          await store.blobsPresent([hash.toUpperCase(), hash.slice(0, 63), `${hash}0`, "%", ""]),
        ).toEqual(new Set());
      });

      it("adds blobs and reads each back whole", async () => {
        await store.addBlobs(
          [
            aBlob("a", { size: 5, mediaType: "text/plain" }),
            aBlob("b", { size: 0, mediaType: "image/png" }),
            aBlob("c", { size: 10 * 1024 * 1024, mediaType: "font/woff2" }),
          ],
          at(SECOND),
        );
        expect(await store.blob(bh("a"))).toEqual({
          hash: bh("a"),
          size: 5,
          mediaType: "text/plain",
          createdAt: at(SECOND),
        });
        expect(await store.blob(bh("b"))).toMatchObject({ size: 0, mediaType: "image/png" });
        expect(await store.blob(bh("c"))).toMatchObject({
          size: 10 * 1024 * 1024,
          mediaType: "font/woff2",
        });
        expect(await store.blob(bh("d"))).toBeUndefined();
        expect(await store.blob("")).toBeUndefined();
        expect(await store.blob(bh("a").toUpperCase())).toBeUndefined();
        await expect(store.addBlobs([], at(SECOND))).resolves.toBeUndefined();
      });

      it("ignores a blob that exists: its size and type stand, and its age is only ever made newer", async () => {
        await store.addBlobs([aBlob("a", { size: 5, mediaType: "text/plain" })], at(HOUR));
        await store.addBlobs([aBlob("a", { size: 999, mediaType: "image/png" })], at(2 * HOUR));
        expect(await store.blob(bh("a"))).toEqual({
          hash: bh("a"),
          size: 5,
          mediaType: "text/plain",
          createdAt: at(2 * HOUR),
        });
        // A register with an earlier time does not make the blob older.
        await store.addBlobs([aBlob("a")], at(SECOND));
        expect((await store.blob(bh("a")))?.createdAt).toBe(at(2 * HOUR));
      });

      it("counts a hash repeated in the list once, and the first stands", async () => {
        await store.addBlobs(
          [aBlob("a", { size: 1 }), aBlob("b"), aBlob("a", { size: 2, mediaType: "image/png" })],
          at(HOUR),
        );
        expect(await store.blob(bh("a"))).toMatchObject({ size: 1, mediaType: "text/plain" });
        expect((await store.blobsPresent([bh("a"), bh("b")])).size).toBe(2);
      });

      it("adds 60 blobs at once, however they are cut up inside", async () => {
        const labels = Array.from({ length: 60 }, (_, i) => `many-${i}`);
        await store.addBlobs(
          labels.map((label, i) => aBlob(label, { size: i })),
          at(HOUR),
        );
        for (const [i, label] of labels.entries()) {
          expect(await store.blob(bh(label)), label).toMatchObject({ size: i });
        }
      });

      describe("uploads to a project", () => {
        it("records a hash once per project and says the project is there", async () => {
          await makeProject(1);
          expect(await store.hasProjectBlob(pid(1), bh("logo"))).toBe(false);
          expect(await store.addProjectBlob(pid(1), bh("logo"))).toBe(true);
          expect(await store.addProjectBlob(pid(1), bh("logo"))).toBe(true);
          expect(await store.hasProjectBlob(pid(1), bh("logo"))).toBe(true);
          expect(await store.projectBlobs(pid(1))).toEqual([bh("logo")]);
        });

        it("records nothing for a project that is not there", async () => {
          expect(await store.addProjectBlob(pid(1), bh("logo"))).toBe(false);
          expect(await store.hasProjectBlob(pid(1), bh("logo"))).toBe(false);
          expect(await store.projectBlobs(pid(1))).toEqual([]);
        });

        it("keeps the hashes of each project to itself, and matches a hash exactly", async () => {
          await makeProject(1);
          await makeProject(2, { ownerSub: "u2" });
          await store.addProjectBlob(pid(1), bh("one"));
          await store.addProjectBlob(pid(2), bh("two"));
          expect(await store.hasProjectBlob(pid(1), bh("two"))).toBe(false);
          expect(await store.hasProjectBlob(pid(2), bh("one"))).toBe(false);
          expect(await store.hasProjectBlob(pid(1), bh("one").toUpperCase())).toBe(false);
          expect(await store.hasProjectBlob(pid(1), bh("one").slice(0, 63))).toBe(false);
          expect(await store.hasProjectBlob(pid(1), "")).toBe(false);
          expect(await store.hasProjectBlob(pid(3), bh("one"))).toBe(false);
          expect(await store.projectBlobs(pid(2))).toEqual([bh("two")]);
        });

        it("lists a project's hashes in order", async () => {
          await makeProject(1);
          const hashes = ["z", "a", "m", "b"].map(bh);
          for (const hash of hashes) await store.addProjectBlob(pid(1), hash);
          expect(await store.projectBlobs(pid(1))).toEqual([...hashes].sort());
          expect(await store.projectBlobs(pid(2))).toEqual([]);
        });

        it("removes one hash of one project and says whether it was there", async () => {
          await makeProject(1);
          await makeProject(2, { ownerSub: "u2" });
          await store.addProjectBlob(pid(1), bh("x"));
          await store.addProjectBlob(pid(2), bh("x"));
          expect(await store.removeProjectBlob(pid(1), bh("nope"))).toBe(false);
          expect(await store.removeProjectBlob(pid(3), bh("x"))).toBe(false);
          expect(await store.removeProjectBlob(pid(1), bh("x"))).toBe(true);
          expect(await store.removeProjectBlob(pid(1), bh("x"))).toBe(false);
          expect(await store.hasProjectBlob(pid(1), bh("x"))).toBe(false);
          expect(await store.hasProjectBlob(pid(2), bh("x"))).toBe(true);
        });

        it("does not create a blob row: the bytes and the reference are separate", async () => {
          await makeProject(1);
          await store.addProjectBlob(pid(1), bh("x"));
          expect(await store.blob(bh("x"))).toBeUndefined();
        });
      });

      describe("what a project holds, for reading a blob", () => {
        it("holds what it uploaded, and nothing else's", async () => {
          await makeProject(1);
          await makeProject(2, { ownerSub: "u2" });
          await store.addProjectBlob(pid(1), bh("mine"));
          await store.addProjectBlob(pid(2), bh("theirs"));
          expect(await store.projectHoldsBlob(pid(1), bh("mine"))).toBe(true);
          expect(await store.projectHoldsBlob(pid(1), bh("theirs"))).toBe(false);
          expect(await store.projectHoldsBlob(pid(2), bh("mine"))).toBe(false);
          expect(await store.projectHoldsBlob(pid(3), bh("mine"))).toBe(false);
          expect(await store.projectHoldsBlob(pid(1), bh("mine").toUpperCase())).toBe(false);
        });

        it("holds what one of its versions holds, even after the file left the project", async () => {
          await makeProject(1);
          await setFiles(pid(1), { "title.png": "old-image" });
          await snapshot(pid(1));
          await setFiles(pid(1), { "title.png": "new-image" });
          // Never the live map: the current file's hash is not held until an upload or a version holds it.
          expect(await store.projectHoldsBlob(pid(1), bh("new-image"))).toBe(false);
          expect(await store.projectHoldsBlob(pid(1), bh("old-image"))).toBe(true);
          await snapshot(pid(1));
          expect(await store.projectHoldsBlob(pid(1), bh("new-image"))).toBe(true);
        });

        it("does not hold what only another project's version holds", async () => {
          await makeProject(1);
          await makeProject(2, { ownerSub: "u2" });
          await setFiles(pid(2), { "a.png": "shared" });
          await snapshot(pid(2), { createdBy: "u2" });
          expect(await store.projectHoldsBlob(pid(1), bh("shared"))).toBe(false);
          expect(await store.projectHoldsBlob(pid(2), bh("shared"))).toBe(true);
        });
      });

      describe("copying for a duplicate", () => {
        it("gives the other project the uploads of the first and keeps the first's", async () => {
          await makeProject(1);
          await makeProject(2);
          for (const label of ["a", "b", "c"]) await store.addProjectBlob(pid(1), bh(label));
          await store.addProjectBlob(pid(2), bh("b"));
          expect(await store.copyProjectBlobs("u1", pid(1), pid(2))).toBe(2);
          expect(await store.projectBlobs(pid(2))).toEqual(["a", "b", "c"].map(bh).sort());
          expect(await store.projectBlobs(pid(1))).toEqual(["a", "b", "c"].map(bh).sort());
          // Again: everything is there, nothing is added.
          expect(await store.copyProjectBlobs("u1", pid(1), pid(2))).toBe(0);
        });

        it("copies only into a project the person owns, and from any project that exists", async () => {
          await makeProject(1);
          await makeProject(2, { ownerSub: "u2" });
          await makeProject(3);
          await store.addProjectBlob(pid(1), bh("a"));
          await store.addProjectBlob(pid(2), bh("b"));
          // Into the project of someone else: nothing, whoever asks.
          expect(await store.copyProjectBlobs("u1", pid(1), pid(2))).toBe(0);
          expect(await store.copyProjectBlobs("u2", pid(1), pid(3))).toBe(0);
          expect(await store.copyProjectBlobs("", pid(1), pid(3))).toBe(0);
          expect(await store.copyProjectBlobs("U1", pid(1), pid(3))).toBe(0);
          expect(await store.projectBlobs(pid(3))).toEqual([]);
          expect(await store.projectBlobs(pid(2))).toEqual([bh("b")]);
          expect(await store.copyProjectBlobs("u1", pid(1), pid(3))).toBe(1);
          // From the project of someone else (a viewer duplicates it: the route resolved that they may read it).
          expect(await store.copyProjectBlobs("u1", pid(2), pid(3))).toBe(1);
          expect(await store.projectBlobs(pid(3))).toEqual([bh("a"), bh("b")].sort());
          // The source keeps what it had.
          expect(await store.projectBlobs(pid(2))).toEqual([bh("b")]);
        });

        it("copies nothing from or to a project that does not exist, or from a project to itself", async () => {
          await makeProject(1);
          await store.addProjectBlob(pid(1), bh("a"));
          expect(await store.copyProjectBlobs("u1", pid(1), pid(9))).toBe(0);
          expect(await store.copyProjectBlobs("u1", pid(9), pid(1))).toBe(0);
          expect(await store.copyProjectBlobs("u1", pid(1), pid(1))).toBe(0);
          expect(await store.projectBlobs(pid(1))).toEqual([bh("a")]);
          expect(await store.projectBlobs(pid(9))).toEqual([]);
        });
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("versions", () => {
      it("records the first version as number 1 and the next as 2, each whole", async () => {
        await makeProject(1);
        await setFiles(pid(1), { a: "a1" });
        const first = await store.createVersion(
          { projectId: pid(1), label: "v1", auto: false, createdBy: "u1", createdAt: at(HOUR) },
          OPEN,
        );
        expect(first).toEqual({
          projectId: pid(1),
          number: 1,
          label: "v1",
          auto: false,
          createdBy: "u1",
          createdAt: at(HOUR),
        });
        const second = await store.createVersion(
          { projectId: pid(1), label: null, auto: true, createdBy: "u2", createdAt: at(2 * HOUR) },
          OPEN,
        );
        expect(second).toEqual({
          projectId: pid(1),
          number: 2,
          label: null,
          auto: true,
          createdBy: "u2",
          createdAt: at(2 * HOUR),
        });
        expect(await store.listVersions(pid(1))).toEqual([first, second]);
        expect(await store.version(pid(1), 2)).toEqual(second);
        expect(await store.latestVersion(pid(1))).toEqual(second);
      });

      it("copies the project's current files, and later changes do not reach the version", async () => {
        await makeProject(1);
        await setFiles(pid(1), { "a.meltemi": "a1", "b.meltemi": "b1" });
        await snapshot(pid(1));
        await setFiles(pid(1), { "a.meltemi": "a2", "c.meltemi": "c1" });
        await snapshot(pid(1));
        await setFiles(pid(1), {});
        expect(await store.versionFiles(pid(1), 1)).toEqual(
          hashed({ "a.meltemi": "a1", "b.meltemi": "b1" }),
        );
        expect(await store.versionFiles(pid(1), 2)).toEqual(
          hashed({ "a.meltemi": "a2", "c.meltemi": "c1" }),
        );
        expect(await store.projectFiles(pid(1))).toEqual(new Map());
      });

      it("records a version of a project with no files, and says its files are none, not unknown", async () => {
        await makeProject(1);
        await snapshot(pid(1));
        expect(await store.versionFiles(pid(1), 1)).toEqual(new Map());
        expect(await store.versionFiles(pid(1), 2)).toBeUndefined();
      });

      it("copies 250 files whole", async () => {
        await makeProject(1);
        const entries = Object.fromEntries(
          Array.from({ length: 250 }, (_, i) => [`f/${i}.meltemi`, `c${i}`]),
        );
        await store.applyMaterialisation({
          projectId: pid(1),
          upserts: hashed(entries),
          deletes: [],
          blobs: [],
          revision: 1,
          now: at(HOUR),
        });
        await snapshot(pid(1));
        expect(await store.versionFiles(pid(1), 1)).toEqual(hashed(entries));
      });

      it("keeps the text of a label and of its author exactly as given", async () => {
        await makeProject(1);
        const label = "<b>x</b> \"q\" 'a'); DROP TABLE versions;-- \n ñ 🌊";
        const version = await snapshot(pid(1), { label, createdBy: "u1' OR '1'='1" });
        expect(version).toMatchObject({ label, createdBy: "u1' OR '1'='1" });
        expect(await store.version(pid(1), 1)).toEqual(version);
        const empty = await snapshot(pid(1), { label: "" });
        expect(empty.label).toBe("");
        expect((await store.version(pid(1), 2))?.label).toBe("");
      });

      it("numbers the versions of each project from 1, whatever the other projects hold", async () => {
        await makeProject(1);
        await makeProject(2, { ownerSub: "u2" });
        await snapshot(pid(1));
        await snapshot(pid(1));
        const other = await snapshot(pid(2), { createdBy: "u2" });
        expect(other.number).toBe(1);
        expect((await store.listVersions(pid(1))).map((v) => v.number)).toEqual([1, 2]);
        expect((await store.listVersions(pid(2))).map((v) => v.number)).toEqual([1]);
        expect(await store.listVersions(pid(3))).toEqual([]);
        expect(await store.latestVersion(pid(3))).toBeUndefined();
      });

      it("continues from the highest number that still exists", async () => {
        await makeProject(1);
        for (let i = 0; i < 4; i++) await snapshot(pid(1));
        await store.deleteVersions(pid(1), [2]);
        expect((await snapshot(pid(1))).number).toBe(5);
        await store.deleteVersions(pid(1), [5, 4]);
        expect((await snapshot(pid(1))).number).toBe(4);
      });

      it("answers undefined for a version or a project that does not exist", async () => {
        await makeProject(1);
        await snapshot(pid(1));
        expect(await store.version(pid(1), 0)).toBeUndefined();
        expect(await store.version(pid(1), 2)).toBeUndefined();
        expect(await store.version(pid(2), 1)).toBeUndefined();
        expect(await store.versionFiles(pid(2), 1)).toBeUndefined();
        expect(await store.versionFiles(pid(1), -1)).toBeUndefined();
      });

      it("hands out copies: changing a result does not change the store", async () => {
        await makeProject(1);
        await setFiles(pid(1), { a: "a1" });
        const made = await snapshot(pid(1));
        (made as { label: string | null }).label = "changed outside";
        (present(await store.version(pid(1), 1)) as { label: string | null }).label = "again";
        (present((await store.listVersions(pid(1)))[0]) as { label: string | null }).label = "too";
        (present(await store.latestVersion(pid(1))) as { label: string | null }).label = "and so";
        present(await store.versionFiles(pid(1), 1)).set("injected", bh("x"));
        expect((await store.version(pid(1), 1))?.label).toBeNull();
        expect((await store.listVersions(pid(1)))[0]?.label).toBeNull();
        expect(await store.versionFiles(pid(1), 1)).toEqual(hashed({ a: "a1" }));
      });

      describe("the conditions", () => {
        it("records versions up to the limit and refuses the next, writing nothing for it", async () => {
          await makeProject(1);
          await setFiles(pid(1), { a: "a1" });
          for (const n of [1, 2, 3])
            expect((await snapshot(pid(1), {}, { maxVersions: 3 })).number).toBe(n);
          await setFiles(pid(1), { a: "a2", b: "b1" });
          const refused = await store.createVersion(
            { projectId: pid(1), label: "no", auto: false, createdBy: "u1", createdAt: at(DAY) },
            { maxVersions: 3 },
          );
          expect(refused).toBe("quota");
          expect(await store.countVersions(pid(1))).toBe(3);
          expect((await store.latestVersion(pid(1)))?.number).toBe(3);
          // The files of the newest version are the ones it was made with, not the refused one's.
          expect(await store.versionFiles(pid(1), 3)).toEqual(hashed({ a: "a1" }));
          expect(await store.versionFiles(pid(1), 4)).toBeUndefined();
        });

        it("allows the 200th version, the project's limit, and refuses the 201st", async () => {
          await makeProject(1);
          for (let n = 1; n <= 200; n++) {
            expect((await snapshot(pid(1), {}, { maxVersions: 200 })).number, `version ${n}`).toBe(
              n,
            );
          }
          expect(
            await store.createVersion(
              { projectId: pid(1), label: null, auto: true, createdBy: "u1", createdAt: at(DAY) },
              { maxVersions: 200 },
            ),
          ).toBe("quota");
          expect(await store.countVersions(pid(1))).toBe(200);
        });

        it("counts per project: one at the limit does not stop another", async () => {
          await makeProject(1);
          await makeProject(2);
          for (let i = 0; i < 2; i++) await snapshot(pid(1), {}, { maxVersions: 2 });
          expect(
            await store.createVersion(
              { projectId: pid(1), label: null, auto: false, createdBy: "u1", createdAt: at(HOUR) },
              { maxVersions: 2 },
            ),
          ).toBe("quota");
          expect((await snapshot(pid(2), {}, { maxVersions: 2 })).number).toBe(1);
        });

        it("gives a place back when versions are deleted", async () => {
          await makeProject(1);
          for (let i = 0; i < 2; i++) await snapshot(pid(1), {}, { maxVersions: 2 });
          await store.deleteVersions(pid(1), [1]);
          expect((await snapshot(pid(1), {}, { maxVersions: 2 })).number).toBe(3);
        });

        it.each([
          ["zero", "quota", 0],
          ["a negative number", "quota", -1],
          ["not a number", "quota", Number.NaN],
          ["infinity", "created", Number.POSITIVE_INFINITY],
        ] as const)(
          "a limit of %s gives %s to a project with no versions",
          async (_label, expected, maxVersions) => {
            await makeProject(1);
            const made = await store.createVersion(
              { projectId: pid(1), label: null, auto: false, createdBy: "u1", createdAt: at(HOUR) },
              { maxVersions },
            );
            expect(typeof made === "string" ? made : "created").toBe(expected);
            expect(await store.countVersions(pid(1))).toBe(expected === "created" ? 1 : 0);
          },
        );

        it("refuses a project that is not there with `missing`, whatever the limits", async () => {
          expect(
            await store.createVersion(
              { projectId: pid(1), label: null, auto: false, createdBy: "u1", createdAt: at(HOUR) },
              OPEN,
            ),
          ).toBe("missing");
          expect(
            await store.createVersion(
              { projectId: pid(1), label: null, auto: false, createdBy: "u1", createdAt: at(HOUR) },
              { maxVersions: 0 },
            ),
          ).toBe("missing");
        });

        it("refuses the version after the rate inside the window, and counts from `since` on, inclusive", async () => {
          await makeProject(1);
          const rate = (since: Iso): VersionGuard => ({
            maxVersions: 1000,
            rate: { max: 3, since },
          });
          for (let i = 0; i < 3; i++) {
            await snapshot(pid(1), { createdAt: at(MINUTE + i * SECOND) }, rate(at(0)));
          }
          const attempt = (since: Iso) =>
            store.createVersion(
              {
                projectId: pid(1),
                label: null,
                auto: false,
                createdBy: "u1",
                createdAt: at(MINUTE + 5 * SECOND),
              },
              rate(since),
            );
          // All three are inside the window, the earliest exactly on its edge.
          expect(await attempt(at(MINUTE))).toBe("rate");
          expect(await store.countVersions(pid(1))).toBe(3);
          // A millisecond later the earliest has left the window.
          expect(typeof (await attempt(at(MINUTE + 1)))).toBe("object");
          expect(await store.countVersions(pid(1))).toBe(4);
        });

        it("refuses the 7th version in a minute and leaves a project with six", async () => {
          await makeProject(1);
          const rate = { maxVersions: 200, rate: { max: 6, since: at(0) } };
          for (let i = 1; i <= 6; i++)
            expect((await snapshot(pid(1), { createdAt: at(i * SECOND) }, rate)).number).toBe(i);
          expect(
            await store.createVersion(
              {
                projectId: pid(1),
                label: null,
                auto: false,
                createdBy: "u1",
                createdAt: at(7 * SECOND),
              },
              rate,
            ),
          ).toBe("rate");
          expect(await store.countVersions(pid(1))).toBe(6);
        });

        it("answers `quota` before `rate` when both hold, and writes nothing for either", async () => {
          await makeProject(1);
          await setFiles(pid(1), { a: "a1" });
          await snapshot(pid(1), { createdAt: at(MINUTE) });
          const both = { maxVersions: 1, rate: { max: 1, since: at(0) } };
          expect(
            await store.createVersion(
              {
                projectId: pid(1),
                label: null,
                auto: false,
                createdBy: "u1",
                createdAt: at(MINUTE),
              },
              both,
            ),
          ).toBe("quota");
          expect(
            await store.createVersion(
              {
                projectId: pid(1),
                label: null,
                auto: false,
                createdBy: "u1",
                createdAt: at(MINUTE),
              },
              { maxVersions: 2, rate: { max: 1, since: at(0) } },
            ),
          ).toBe("rate");
          expect(await store.countVersions(pid(1))).toBe(1);
          expect(await store.versionFiles(pid(1), 1)).toEqual(hashed({ a: "a1" }));
        });

        it("counts only the project's own versions for the rate", async () => {
          await makeProject(1);
          await makeProject(2);
          const rate = { maxVersions: 100, rate: { max: 1, since: at(0) } };
          await snapshot(pid(1), { createdAt: at(MINUTE) }, rate);
          expect((await snapshot(pid(2), { createdAt: at(MINUTE) }, rate)).number).toBe(1);
        });

        it("applies no rate when none is given", async () => {
          await makeProject(1);
          for (let i = 0; i < 12; i++)
            await snapshot(pid(1), { createdAt: at(MINUTE) }, { maxVersions: 100 });
          expect(await store.countVersions(pid(1))).toBe(12);
        });
      });

      describe("counting", () => {
        it("counts a project's versions, and the ones made at or after a time", async () => {
          await makeProject(1);
          await makeProject(2);
          for (const ms of [0, MINUTE, 2 * MINUTE, 2 * MINUTE])
            await snapshot(pid(1), { createdAt: at(ms) });
          await snapshot(pid(2), { createdAt: at(2 * MINUTE) });
          expect(await store.countVersions(pid(1))).toBe(4);
          expect(await store.countVersions(pid(2))).toBe(1);
          expect(await store.countVersions(pid(3))).toBe(0);
          expect(await store.countVersionsSince(pid(1), at(-HOUR))).toBe(4);
          expect(await store.countVersionsSince(pid(1), at(MINUTE))).toBe(3);
          expect(await store.countVersionsSince(pid(1), at(2 * MINUTE))).toBe(2);
          expect(await store.countVersionsSince(pid(1), at(2 * MINUTE + 1))).toBe(0);
          expect(await store.countVersionsSince(pid(3), at(0))).toBe(0);
        });
      });

      describe("deleting versions", () => {
        it("removes the versions named and their files, and only those", async () => {
          await makeProject(1);
          await makeProject(2, { ownerSub: "u2" });
          await setFiles(pid(1), { a: "a1" });
          await setFiles(pid(2), { a: "a1" });
          for (let i = 0; i < 4; i++) await snapshot(pid(1));
          await snapshot(pid(2), { createdBy: "u2" });
          await store.deleteVersions(pid(1), [2, 3]);
          expect((await store.listVersions(pid(1))).map((v) => v.number)).toEqual([1, 4]);
          expect(await store.versionFiles(pid(1), 2)).toBeUndefined();
          expect(await store.versionFiles(pid(1), 4)).toEqual(hashed({ a: "a1" }));
          expect((await store.listVersions(pid(2))).map((v) => v.number)).toEqual([1]);
          expect(await store.versionFiles(pid(2), 1)).toEqual(hashed({ a: "a1" }));
        });

        it("ignores numbers that name no version, a repeated number, and an empty list", async () => {
          await makeProject(1);
          for (let i = 0; i < 3; i++) await snapshot(pid(1));
          await store.deleteVersions(pid(1), []);
          await store.deleteVersions(pid(1), [9, 0, -1, 2, 2, 2]);
          expect((await store.listVersions(pid(1))).map((v) => v.number)).toEqual([1, 3]);
          await expect(store.deleteVersions(pid(9), [1])).resolves.toBeUndefined();
        });

        it("removes 120 versions at once, however the list is cut up inside", async () => {
          await makeProject(1);
          await setFiles(pid(1), { a: "a1", b: "b1" });
          for (let i = 0; i < 150; i++) await snapshot(pid(1));
          const gone = Array.from({ length: 120 }, (_, i) => i + 1);
          await store.deleteVersions(pid(1), gone);
          const left = await store.listVersions(pid(1));
          expect(left.map((v) => v.number)).toEqual(Array.from({ length: 30 }, (_, i) => i + 121));
          expect(await store.versionFiles(pid(1), 1)).toBeUndefined();
          expect(await store.versionFiles(pid(1), 150)).toEqual(hashed({ a: "a1", b: "b1" }));
          expect((await store.versionChanges(pid(1))).size).toBe(30);
        });
      });

      describe("what changed between versions", () => {
        const names = (changes: Map<number, string[]>) => Object.fromEntries(changes);

        it("lists, for each version, the paths added, changed and removed since the one before", async () => {
          await makeProject(1);
          await setFiles(pid(1), { a: "a1", b: "b1" });
          await snapshot(pid(1));
          await setFiles(pid(1), { a: "a2", b: "b1", c: "c1" });
          await snapshot(pid(1));
          await setFiles(pid(1), { a: "a2", c: "c1" });
          await snapshot(pid(1));
          await snapshot(pid(1));
          await setFiles(pid(1), { a: "a2", c: "c2", d: "d1" });
          await snapshot(pid(1));
          expect(names(await store.versionChanges(pid(1)))).toEqual({
            1: ["a", "b"],
            2: ["a", "c"],
            3: ["b"],
            4: [],
            5: ["c", "d"],
          });
        });

        it("compares with the previous version that still exists", async () => {
          await makeProject(1);
          await setFiles(pid(1), { a: "a1", b: "b1" });
          await snapshot(pid(1));
          await setFiles(pid(1), { a: "a1", b: "b1", c: "c1" });
          await snapshot(pid(1));
          await setFiles(pid(1), { a: "a1", c: "c1" });
          await snapshot(pid(1));
          await store.deleteVersions(pid(1), [2]);
          // Version 3 against version 1: c is new, b is gone.
          expect(names(await store.versionChanges(pid(1)))).toEqual({
            1: ["a", "b"],
            3: ["b", "c"],
          });
          await store.deleteVersions(pid(1), [1]);
          expect(names(await store.versionChanges(pid(1)))).toEqual({ 3: ["a", "c"] });
        });

        it("counts a rename as the old path removed and the new one added", async () => {
          await makeProject(1);
          await setFiles(pid(1), { "old.meltemi": "same" });
          await snapshot(pid(1));
          await setFiles(pid(1), { "new.meltemi": "same" });
          await snapshot(pid(1));
          expect(names(await store.versionChanges(pid(1)))[2]).toEqual([
            "new.meltemi",
            "old.meltemi",
          ]);
        });

        it("lists the paths in binary order, the order of their UTF-8 bytes", async () => {
          await makeProject(1);
          await setFiles(pid(1), { a: "a1" });
          await snapshot(pid(1));
          // z, é (U+00E9), U+FF5E and 😀 (U+1F600): UTF-16 order would put the emoji before U+FF5E.
          await setFiles(pid(1), { a: "a1", "😀": "x", "～": "x", é: "x", z: "x", B: "x" });
          await snapshot(pid(1));
          expect((await store.versionChanges(pid(1))).get(2)).toEqual(["B", "z", "é", "～", "😀"]);
        });

        it("has an entry for every version, empty when it changed nothing, and none for a project without versions", async () => {
          await makeProject(1);
          expect(await store.versionChanges(pid(1))).toEqual(new Map());
          await snapshot(pid(1));
          expect(await store.versionChanges(pid(1))).toEqual(new Map([[1, []]]));
          expect(await store.versionChanges(pid(9))).toEqual(new Map());
        });

        it("keeps the projects apart", async () => {
          await makeProject(1);
          await makeProject(2, { ownerSub: "u2" });
          await setFiles(pid(1), { a: "a1" });
          await setFiles(pid(2), { z: "z1", y: "y1" });
          await snapshot(pid(1));
          await snapshot(pid(2), { createdBy: "u2" });
          expect(names(await store.versionChanges(pid(1)))).toEqual({ 1: ["a"] });
          expect(names(await store.versionChanges(pid(2)))).toEqual({ 1: ["y", "z"] });
        });

        it("reads 250 files and tells the one that changed", async () => {
          await makeProject(1);
          const entries = Object.fromEntries(
            Array.from({ length: 250 }, (_, i) => [`f/${String(i).padStart(3, "0")}`, `c${i}`]),
          );
          await setFiles(pid(1), entries);
          await snapshot(pid(1));
          await setFiles(pid(1), { ...entries, "f/100": "changed" });
          await snapshot(pid(1));
          const changes = await store.versionChanges(pid(1));
          expect(changes.get(1)).toHaveLength(250);
          expect(changes.get(2)).toEqual(["f/100"]);
        });
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("usage", () => {
      /** u1 and u2, and the blobs X (100), Y (50), Z (25), W (7, unreferenced) and V (1000). */
      const world = async () => {
        await person("u1");
        await person("u2");
        await store.addBlobs(
          [
            aBlob("X", { size: 100 }),
            aBlob("Y", { size: 50 }),
            aBlob("Z", { size: 25 }),
            aBlob("W", { size: 7 }),
            aBlob("V", { size: 1000 }),
            aBlob("Y2", { size: 3 }),
          ],
          at(HOUR),
        );
      };

      it("adds up each blob once: shared by two projects, by a project and its versions, or uploaded and used", async () => {
        await world();
        await makeProject(1);
        await makeProject(2);
        await setFiles(pid(1), { a: "X", b: "Y" });
        await setFiles(pid(2), { a: "X" });
        await store.addProjectBlob(pid(1), bh("Z"));
        await store.addProjectBlob(pid(1), bh("X"));
        await snapshot(pid(1));
        await setFiles(pid(1), { a: "X", b: "Y2" });
        // X twice over, Y in a version, Y2 in the project, Z uploaded; W is nobody's.
        expect(await store.storageBytesOf("u1")).toBe(100 + 50 + 3 + 25);
      });

      it("counts the person's own references alone: another person's projects add and hide nothing", async () => {
        await world();
        await makeProject(1);
        await makeProject(2, { ownerSub: "u2" });
        await setFiles(pid(1), { a: "X" });
        await setFiles(pid(2), { a: "V", b: "X" });
        expect(await store.storageBytesOf("u1")).toBe(100);
        expect(await store.storageBytesOf("u2")).toBe(1100);
        expect(await store.storageBytesOf("nobody")).toBe(0);
        expect(await store.storageBytesOf("u")).toBe(0);
      });

      it("counts nothing for a hash that has no blob row", async () => {
        await world();
        await makeProject(1);
        await store.applyMaterialisation({
          projectId: pid(1),
          upserts: hashed({ a: "X", ghost: "no-such-blob" }),
          deletes: [],
          blobs: [],
          revision: 1,
          now: at(HOUR),
        });
        await store.addProjectBlob(pid(1), bh("also-missing"));
        expect(await store.storageBytesOf("u1")).toBe(100);
      });

      it("is the sum of the blobs after a version has been deleted, a project deleted and an upload removed", async () => {
        await world();
        await makeProject(1);
        await makeProject(2);
        await setFiles(pid(1), { a: "X", b: "Y" });
        await snapshot(pid(1));
        await setFiles(pid(1), { a: "X" });
        await setFiles(pid(2), { z: "Z" });
        await store.addProjectBlob(pid(2), bh("V"));
        expect(await store.storageBytesOf("u1")).toBe(100 + 50 + 25 + 1000);
        await store.removeProjectBlob(pid(2), bh("V"));
        expect(await store.storageBytesOf("u1")).toBe(100 + 50 + 25);
        await store.deleteVersions(pid(1), [1]);
        expect(await store.storageBytesOf("u1")).toBe(100 + 25);
        await store.deleteProject("u1", pid(2));
        expect(await store.storageBytesOf("u1")).toBe(100);
        await store.deleteProject("u1", pid(1));
        expect(await store.storageBytesOf("u1")).toBe(0);
      });

      it("stores the figure when it is refreshed, and the usage shows the stored figure", async () => {
        await world();
        await makeProject(1);
        await makeProject(2);
        await setFiles(pid(1), { a: "X" });
        expect(await store.usage("u1")).toEqual({ projects: 2, storageBytes: 0 });
        expect(await store.refreshStorageBytes("u1")).toBe(100);
        expect(await store.usage("u1")).toEqual({ projects: 2, storageBytes: 100 });
        // The figure is stored, not computed on every read: it moves when it is refreshed.
        await setFiles(pid(2), { b: "Y" });
        expect(await store.usage("u1")).toEqual({ projects: 2, storageBytes: 100 });
        expect(await store.refreshStorageBytes("u1")).toBe(150);
        expect(await store.usage("u1")).toEqual({ projects: 2, storageBytes: 150 });
        await store.deleteProject("u1", pid(1));
        expect(await store.refreshStorageBytes("u1")).toBe(50);
        expect(await store.usage("u1")).toEqual({ projects: 1, storageBytes: 50 });
      });

      it("refreshes one person's figure and no one else's", async () => {
        await world();
        await makeProject(1);
        await makeProject(2, { ownerSub: "u2" });
        await setFiles(pid(1), { a: "X" });
        await setFiles(pid(2), { a: "V" });
        await store.refreshStorageBytes("u1");
        expect(await store.usage("u1")).toEqual({ projects: 1, storageBytes: 100 });
        expect(await store.usage("u2")).toEqual({ projects: 1, storageBytes: 0 });
        await store.refreshStorageBytes("u2");
        expect(await store.usage("u2")).toEqual({ projects: 1, storageBytes: 1000 });
        expect(await store.usage("u1")).toEqual({ projects: 1, storageBytes: 100 });
      });

      it("answers zeros for a person who is not there, and stores nothing for them", async () => {
        await world();
        await makeProject(1, { ownerSub: "ghost" });
        await setFiles(pid(1), { a: "X" });
        expect(await store.refreshStorageBytes("ghost")).toBe(0);
        expect(await store.usage("ghost")).toEqual({ projects: 1, storageBytes: 0 });
        expect(await store.usage("nobody")).toEqual({ projects: 0, storageBytes: 0 });
        // Once the person has a row the figure can be stored.
        await person("ghost");
        expect(await store.refreshStorageBytes("ghost")).toBe(100);
        expect(await store.usage("ghost")).toEqual({ projects: 1, storageBytes: 100 });
      });

      it("starts again from zero for a person who was deleted and came back", async () => {
        await world();
        await makeProject(1);
        await setFiles(pid(1), { a: "X" });
        await store.refreshStorageBytes("u1");
        await store.applyUserDeleted("evt_1", "u1", at(DAY));
        await person("u1");
        expect(await store.usage("u1")).toEqual({ projects: 0, storageBytes: 0 });
        expect(await store.storageBytesOf("u1")).toBe(0);
      });

      it("adds up large sizes exactly", async () => {
        await person("u1");
        await makeProject(1);
        const big = 10 * 1024 * 1024;
        await store.addBlobs(
          [aBlob("big1", { size: big }), aBlob("big2", { size: big })],
          at(HOUR),
        );
        await setFiles(pid(1), { a: "big1", b: "big2" });
        expect(await store.refreshStorageBytes("u1")).toBe(2 * big);
        expect((await store.usage("u1")).storageBytes).toBe(2 * big);
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("collecting blobs", () => {
      const WEEK = 7 * DAY;

      /** Registers the blobs called by the labels, all created at `ms`. */
      const register = (labels: string[], ms: number) =>
        store.addBlobs(
          labels.map((label) => aBlob(label)),
          at(ms),
        );

      it("lists the blobs older than the time that nothing references, the oldest first", async () => {
        await register(["young"], 3 * DAY);
        await register(["b-old", "a-old"], DAY);
        await register(["oldest"], 0);
        expect(await store.unreferencedBlobs(at(WEEK), 100)).toEqual([
          bh("oldest"),
          ...[bh("a-old"), bh("b-old")].sort(),
          bh("young"),
        ]);
        expect(await store.unreferencedBlobs(at(2 * DAY), 100)).toEqual([
          bh("oldest"),
          ...[bh("a-old"), bh("b-old")].sort(),
        ]);
      });

      it("takes a blob created exactly at the time for too young, and one a millisecond older for old enough", async () => {
        await register(["edge"], WEEK);
        expect(await store.unreferencedBlobs(at(WEEK), 100)).toEqual([]);
        expect(await store.unreferencedBlobs(at(WEEK + 1), 100)).toEqual([bh("edge")]);
      });

      it("returns at most the number asked for, the oldest of them, and none for a limit of no use", async () => {
        for (let i = 0; i < 5; i++) await register([`blob-${i}`], i * SECOND);
        expect(await store.unreferencedBlobs(at(WEEK), 2)).toEqual([bh("blob-0"), bh("blob-1")]);
        expect(await store.unreferencedBlobs(at(WEEK), 5)).toHaveLength(5);
        expect(await store.unreferencedBlobs(at(WEEK), 50)).toHaveLength(5);
        expect(await store.unreferencedBlobs(at(WEEK), Number.POSITIVE_INFINITY)).toHaveLength(5);
        for (const useless of [0, -1, Number.NaN]) {
          expect(await store.unreferencedBlobs(at(WEEK), useless), String(useless)).toEqual([]);
        }
      });

      it("lists nothing for an empty store", async () => {
        expect(await store.unreferencedBlobs(at(WEEK), 100)).toEqual([]);
        expect(await store.deleteBlobs([], at(WEEK))).toEqual([]);
      });

      it("keeps a blob that a project's files, an upload or a version references, and frees it when that goes", async () => {
        await makeProject(1);
        await register(["file", "upload", "version", "free"], 0);
        await store.applyMaterialisation({
          projectId: pid(1),
          upserts: hashed({ "a.meltemi": "file", "b.png": "version" }),
          deletes: [],
          blobs: [],
          revision: 1,
          now: at(HOUR),
        });
        await store.addProjectBlob(pid(1), bh("upload"));
        await snapshot(pid(1));
        // "version" now leaves the project's files, and only the version holds it.
        await store.applyMaterialisation({
          projectId: pid(1),
          upserts: new Map(),
          deletes: ["b.png"],
          blobs: [],
          revision: 2,
          now: at(2 * HOUR),
        });
        expect(await store.unreferencedBlobs(at(WEEK), 100)).toEqual([bh("free")]);

        await store.deleteVersions(pid(1), [1]);
        expect(await store.unreferencedBlobs(at(WEEK), 100)).toEqual(
          [bh("free"), bh("version")].sort(),
        );
        await store.removeProjectBlob(pid(1), bh("upload"));
        expect(await store.unreferencedBlobs(at(WEEK), 100)).toHaveLength(3);
        await store.deleteProject("u1", pid(1));
        expect(await store.unreferencedBlobs(at(WEEK), 100)).toHaveLength(4);
      });

      it("keeps a blob that another person's project still references after the first person goes", async () => {
        await makeProject(1);
        await makeProject(2, { ownerSub: "u2" });
        await register(["shared", "mine"], 0);
        await setFiles(pid(1), { a: "shared", b: "mine" });
        await setFiles(pid(2), { a: "shared" });
        await store.applyUserDeleted("evt_1", "u1", at(DAY));
        expect(await store.unreferencedBlobs(at(WEEK), 100)).toEqual([bh("mine")]);
      });

      it("removes the listed blobs, answers which, and leaves the rest", async () => {
        await makeProject(1);
        await register(["gone-1", "gone-2", "kept"], 0);
        await register(["young"], 8 * DAY);
        await setFiles(pid(1), { a: "kept" }, { now: at(0) });
        const listed = await store.unreferencedBlobs(at(WEEK), 100);
        expect([...listed].sort()).toEqual([bh("gone-1"), bh("gone-2")].sort());
        const removed = await store.deleteBlobs(listed, at(WEEK));
        expect([...removed].sort()).toEqual([bh("gone-1"), bh("gone-2")].sort());
        expect(
          await store.blobsPresent([bh("gone-1"), bh("gone-2"), bh("young"), bh("kept")]),
        ).toEqual(new Set([bh("kept"), bh("young")]));
        // A blob too young for the time is kept even when it is named.
        expect(await store.deleteBlobs([bh("young")], at(WEEK))).toEqual([]);
      });

      it("keeps a blob that was referenced after the list was made", async () => {
        await makeProject(1);
        await register(["late-ref", "plain"], 0);
        const listed = await store.unreferencedBlobs(at(WEEK), 100);
        expect(listed).toHaveLength(2);
        await store.addProjectBlob(pid(1), bh("late-ref"));
        const removed = await store.deleteBlobs(listed, at(WEEK));
        expect(removed).toEqual([bh("plain")]);
        expect((await store.blob(bh("late-ref")))?.hash).toBe(bh("late-ref"));
      });

      it("keeps a blob that was registered again after the list was made", async () => {
        await register(["again", "plain"], 0);
        const listed = await store.unreferencedBlobs(at(WEEK), 100);
        await register(["again"], 8 * DAY);
        const removed = await store.deleteBlobs(listed, at(WEEK));
        expect(removed).toEqual([bh("plain")]);
        expect(await store.blobsPresent([bh("again")])).toEqual(new Set([bh("again")]));
      });

      it("removes 250 blobs at once, however the list is cut up inside, naming a repeated hash once", async () => {
        const labels = Array.from({ length: 250 }, (_, i) => `bulk-${i}`);
        await register(labels, 0);
        await register(["survivor"], 0);
        await makeProject(1);
        await setFiles(pid(1), { a: "survivor" });
        const listed = await store.unreferencedBlobs(at(WEEK), 1000);
        expect(listed).toHaveLength(250);
        const removed = await store.deleteBlobs(
          [...listed, ...listed.slice(0, 10), bh("survivor")],
          at(WEEK),
        );
        expect([...removed].sort()).toEqual([...listed].sort());
        expect(await store.blobsPresent([...listed, bh("survivor")])).toEqual(
          new Set([bh("survivor")]),
        );
      });

      it("says a hash that has no row has none, whoever removed it", async () => {
        await register(["a"], 0);
        expect(await store.deleteBlobs([bh("never-there"), bh("a")], at(WEEK))).toEqual([
          bh("never-there"),
          bh("a"),
        ]);
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("deleting a person who has projects", () => {
      /** Two projects of `sub`, each with files, an upload, a version and a thumbnail. */
      const withProjects = async (sub: string, first: number) => {
        await person(sub);
        for (const n of [first, first + 1]) {
          await makeProject(n, { ownerSub: sub });
          await setFiles(pid(n), { "a.meltemi": `${sub}-a`, "shared.png": "shared" });
          await store.addProjectBlob(pid(n), bh("upload"));
          await snapshot(pid(n), { createdBy: sub });
          await store.claimThumbnail(pid(n), at(HOUR), at(0));
        }
        await store.refreshStorageBytes(sub);
      };

      const holds = async (n: number) => ({
        project: await store.project(
          // The owner is whoever the id says; read it as the owner would.
          (await store.ownerOf(pid(n))) ?? "nobody",
          pid(n),
        ),
        files: await store.projectFiles(pid(n)),
        uploads: await store.projectBlobs(pid(n)),
        versions: await store.listVersions(pid(n)),
        firstVersion: await store.versionFiles(pid(n), 1),
      });

      it("removes their projects with the files, uploads, versions and thumbnails, and says it was applied", async () => {
        await store.addBlobs(
          [aBlob("upload", { mediaType: "image/png" }), aBlob("shared")],
          at(HOUR),
        );
        await withProjects("u1", 1);
        expect(await store.projectIdsOf("u1")).toEqual([pid(1), pid(2)]);
        expect(await store.applyUserDeleted("evt_1", "u1", at(DAY))).toBe("applied");
        expect(await store.projectIdsOf("u1")).toEqual([]);
        expect(await store.listProjects("u1")).toEqual([]);
        expect(await store.countProjects("u1")).toBe(0);
        for (const n of [1, 2]) {
          expect(await holds(n), `project ${n}`).toEqual({
            project: undefined,
            files: new Map(),
            uploads: [],
            versions: [],
            firstVersion: undefined,
          });
        }
        expect(await store.usage("u1")).toEqual({ projects: 0, storageBytes: 0 });
      });

      it("leaves everyone else's projects whole, a sub that merely starts the same included", async () => {
        await store.addBlobs([aBlob("upload"), aBlob("shared")], at(HOUR));
        await withProjects("u1", 1);
        await withProjects("u2", 3);
        await withProjects("u1-and-more", 5);
        const kept = await Promise.all([3, 4, 5, 6].map(holds));
        const usage = await store.usage("u2");
        expect(await store.applyUserDeleted("evt_1", "u1", at(DAY))).toBe("applied");
        expect(await Promise.all([3, 4, 5, 6].map(holds))).toEqual(kept);
        expect(kept[0]?.project?.ownerSub).toBe("u2");
        expect(kept[2]?.files.size).toBe(2);
        expect(await store.usage("u2")).toEqual(usage);
        expect((await store.listProjects("u1-and-more")).map((p) => p.id)).toEqual([
          pid(6),
          pid(5),
        ]);
      });

      it("keeps the blob rows: they are shared by content and wait for the collection", async () => {
        await store.addBlobs([aBlob("upload"), aBlob("shared")], at(0));
        await withProjects("u1", 1);
        await withProjects("u2", 3);
        await store.applyUserDeleted("evt_1", "u1", at(DAY));
        expect(
          await store.blobsPresent([bh("u1-a"), bh("u2-a"), bh("upload"), bh("shared")]),
        ).toEqual(new Set([bh("u1-a"), bh("u2-a"), bh("upload"), bh("shared")]));
        // What only the deleted person referenced can now be collected; what u2 holds cannot.
        await store.addBlobs([aBlob("u1-a"), aBlob("u2-a")], at(0));
        expect(await store.unreferencedBlobs(at(30 * DAY), 100)).toEqual([bh("u1-a")]);
      });

      it("handles a repeat of the event without touching the projects of a person who came back", async () => {
        await store.addBlobs([aBlob("upload"), aBlob("shared")], at(HOUR));
        await withProjects("u1", 1);
        await store.applyUserDeleted("evt_1", "u1", at(DAY));
        await withProjects("u1", 1);
        const kept = await Promise.all([1, 2].map(holds));
        expect(await store.applyUserDeleted("evt_1", "u1", at(2 * DAY))).toBe("duplicate");
        expect(await Promise.all([1, 2].map(holds))).toEqual(kept);
        expect(await store.countProjects("u1")).toBe(2);
      });

      it("deletes the projects of a person who has none, and of one who has no row", async () => {
        await withProjects("u2", 3);
        expect(await store.applyUserDeleted("evt_1", "ghost", at(DAY))).toBe("applied");
        expect(await store.applyUserDeleted("evt_2", "u2", at(DAY))).toBe("applied");
        expect(await store.projectIdsOf("u2")).toEqual([]);
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("many project operations at once", () => {
      const rounds = Array.from({ length: 6 }, (_, i) => i + 1);

      it("never lets racing creates take a person past the limit", async () => {
        const results = await Promise.all(
          Array.from({ length: 35 }, (_, i) => store.createProject(aProject(i + 1), 20)),
        );
        expect(results.filter((r) => r === "created")).toHaveLength(20);
        expect(results.filter((r) => r === "quota")).toHaveLength(15);
        expect(await store.countProjects("u1")).toBe(20);
      });

      it("lets exactly one of the requests that race for the last place have it", async () => {
        for (let n = 1; n <= 19; n++) await makeProject(n);
        const results = await Promise.all(
          [20, 21, 22, 23, 24].map((n) => store.createProject(aProject(n), 20)),
        );
        expect(results.filter((r) => r === "created")).toHaveLength(1);
        expect(await store.countProjects("u1")).toBe(20);
      });

      it("keeps the limit of each person when several race at once", async () => {
        const racers = ["u1", "u2", "u3"].flatMap((sub, s) =>
          Array.from({ length: 8 }, (_, i) =>
            store.createProject(aProject(s * 10 + i + 1, { ownerSub: sub }), 5),
          ),
        );
        const results = await Promise.all(racers);
        expect(results.filter((r) => r === "created")).toHaveLength(15);
        for (const sub of ["u1", "u2", "u3"]) expect(await store.countProjects(sub)).toBe(5);
      });

      it("never lets racing versions pass the limit, and numbers each of those that pass once", async () => {
        for (const round of rounds) {
          const project = await makeProject(round);
          await setFiles(project.id, { a: "a1", b: "b1" });
          const results = await Promise.all(
            Array.from({ length: 8 }, () =>
              store.createVersion(
                {
                  projectId: project.id,
                  label: null,
                  auto: false,
                  createdBy: "u1",
                  createdAt: at(HOUR),
                },
                { maxVersions: 3 },
              ),
            ),
          );
          const made = results.filter((r): r is Version => typeof r !== "string");
          expect(made.map((v) => v.number).sort(), `round ${round}`).toEqual([1, 2, 3]);
          expect(results.filter((r) => r === "quota")).toHaveLength(5);
          expect((await store.listVersions(project.id)).map((v) => v.number)).toEqual([1, 2, 3]);
          for (const number of [1, 2, 3]) {
            expect(
              await store.versionFiles(project.id, number),
              `round ${round} version ${number}`,
            ).toEqual(hashed({ a: "a1", b: "b1" }));
          }
        }
      });

      it("never lets racing versions pass the rate", async () => {
        const project = await makeProject(1);
        const results = await Promise.all(
          Array.from({ length: 10 }, () =>
            store.createVersion(
              {
                projectId: project.id,
                label: null,
                auto: false,
                createdBy: "u1",
                createdAt: at(MINUTE),
              },
              { maxVersions: 200, rate: { max: 6, since: at(0) } },
            ),
          ),
        );
        expect(results.filter((r) => typeof r !== "string")).toHaveLength(6);
        expect(results.filter((r) => r === "rate")).toHaveLength(4);
        expect(await store.countVersions(project.id)).toBe(6);
      });

      it("lets one of the requests that race for a thumbnail write it", async () => {
        await makeProject(1);
        const results = await Promise.all(
          [1, 2, 3, 4, 5, 6].map((n) =>
            store.claimThumbnail(pid(1), at(MINUTE + n * SECOND), at(MINUTE - 30 * SECOND)),
          ),
        );
        // Every claim accepts replacing a thumbnail recorded up to a time before all of them, so
        // the first to run records its own and the rest find it too new.
        expect(results.filter(Boolean)).toHaveLength(1);
      });

      it("deletes a project for one of the requests that ask", async () => {
        await makeProject(1);
        await setFiles(pid(1), { a: "a1" });
        await snapshot(pid(1));
        const results = await Promise.all([1, 2, 3].map(() => store.deleteProject("u1", pid(1))));
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(await store.projectFiles(pid(1))).toEqual(new Map());
        expect(await store.listVersions(pid(1))).toEqual([]);
      });

      it("leaves nothing of a project behind when writes for it race with its deletion", async () => {
        for (const round of rounds) {
          const project = await makeProject(round);
          await setFiles(project.id, { a: "a1" });
          await Promise.all([
            store.deleteProject("u1", project.id),
            store.applyMaterialisation({
              projectId: project.id,
              upserts: hashed({ late: "late" }),
              deletes: [],
              blobs: [aBlob("late")],
              revision: 5,
              now: at(DAY),
            }),
            store.createVersion(
              {
                projectId: project.id,
                label: null,
                auto: false,
                createdBy: "u1",
                createdAt: at(DAY),
              },
              OPEN,
            ),
            store.addProjectBlob(project.id, bh("late-upload")),
            store.copyProjectBlobs("u1", project.id, project.id),
          ]);
          expect(await store.project("u1", project.id), `round ${round}`).toBeUndefined();
          expect(await store.projectFiles(project.id), `round ${round}`).toEqual(new Map());
          expect(await store.listVersions(project.id), `round ${round}`).toEqual([]);
          expect(await store.versionFiles(project.id, 1), `round ${round}`).toBeUndefined();
          expect(await store.projectBlobs(project.id), `round ${round}`).toEqual([]);
        }
      });

      it("registers a blob once when several materialisations bring the same bytes", async () => {
        for (const n of [1, 2, 3]) await makeProject(n, { ownerSub: `u${n}` });
        const results = await Promise.all(
          [1, 2, 3].map((n) =>
            store.applyMaterialisation({
              projectId: pid(n),
              upserts: hashed({ "same.meltemi": "same" }),
              deletes: [],
              blobs: [aBlob("same", { size: n })],
              revision: 1,
              now: at(n * SECOND),
            }),
          ),
        );
        expect(results).toEqual([true, true, true]);
        const blob = present(await store.blob(bh("same")));
        // Whichever got there first set the size; the age is the newest of the three.
        expect([1, 2, 3]).toContain(blob.size);
        expect(blob.createdAt).toBe(at(3 * SECOND));
        for (const n of [1, 2, 3]) {
          expect(await store.projectFiles(pid(n))).toEqual(hashed({ "same.meltemi": "same" }));
        }
      });

      it("never lets a collection take a blob that a request references at the same moment", async () => {
        for (const round of rounds) {
          const project = await makeProject(round);
          const label = `race-${round}`;
          await store.addBlobs([aBlob(label)], at(0));
          const listed = await store.unreferencedBlobs(at(30 * DAY), 100);
          expect(listed).toContain(bh(label));
          const [removed] = await Promise.all([
            store.deleteBlobs([bh(label)], at(30 * DAY)),
            store.addProjectBlob(project.id, bh(label)),
          ]);
          // Either the reference came first (the blob stays, nothing is removed) or the removal
          // did (the blob is gone, and is reported as removed); never a blob reported removed that
          // is still there, or one kept that was reported removed. An upload registers the blob
          // again just before it references it, which closes the rest of the window.
          const stays = await store.blobsPresent([bh(label)]);
          expect(removed.length === 0, `round ${round}`).toBe(stays.has(bh(label)));
        }
      });
    });
  });
}
