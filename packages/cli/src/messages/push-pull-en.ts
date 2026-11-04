/**
 * The words of `push` and `pull` in English (`cli-cloud`), kept beside `en.ts` so that the two
 * commands own their sentences: their help, their output, and the failures they name by stable code
 * (`push.*`, `pull.*`, and the service's own codes as these commands meet them). `en.ts` hangs them
 * under `help` and `cloud`; `push-pull-es.ts` has the Spanish with the same shape.
 */

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const pushPullEn = {
  help: {
    push: `Usage: push [folder] [options]

Makes the cloud project match the folder (the working folder by default): project.json, the
sheets, themes and other text files travel by content, images and fonts by hash, and what the
folder lacks is deleted in the cloud, all in one transaction. Dotfiles, node_modules, what
project.json excludes and the catalog's output folder are never sent. The cloud project is the
one --project names, else project.json's "cloud".

Before changing anything it compares every path with the cloud's and lists those that differ,
beside the review by id of the diagrams. Only a cloud that already matches the folder is pushed
without asking; otherwise a terminal is asked "Overwrite these changes in the cloud?", and without
one the push is refused unless --force. A change made in the cloud while pushing is never
overwritten without that question (or --force).

Options:
  --create          Make a new cloud project from the folder and record it in project.json
  --name <name>     With --create, the project's name; project.json's name by default
  --project <id>    The cloud project, instead of project.json's "cloud"
  --force           Overwrite what differs in the cloud without asking
  --check           Write nothing; list what differs (exit 1 if anything does)
  --strict          Do not push when validation finds errors
  --host <url>      The service: MELTEMI_HOST, else https://diagrams.meltemi.dev

Exit codes: 0 pushed, or nothing to push, 1 refused or failed (or --check found differences),
2 usage error, 3 not signed in or the service refused the token.
`,
    pull: `Usage: pull [<id>] [folder] [options]

Writes the files of a cloud project into the folder (the working folder by default). The project
is <id> (20 letters and digits), else the one project.json's "cloud" names. Files that already
match are left alone; a file that exists and differs is listed and kept unless --force; files
that are only in the folder stay. Images and fonts are fetched by hash and checked. project.json
gains "cloud" when it has none, and nothing else of it changes.

Every cloud path is checked before anything is written: one that is not a plain relative path
inside the folder (or that Windows could not keep) refuses the whole pull with pull.unsafe-path.

Options:
  --version <n>  Pull this version of the project instead of its latest files
  --force        Overwrite files that differ
  --host <url>   The service: MELTEMI_HOST, else https://diagrams.meltemi.dev

Exit codes: 0 pulled, 1 refused, failed or some files kept, 2 usage error, 3 not signed in or the
service refused the token.
`,
  },
  push: {
    nameNeedsCreate: "--name goes with --create.",
    nameEmpty: "--name needs a name.",
    createWithProject: "--create makes a new project, so it cannot be combined with --project.",
    checkWithCreate: "--check only reports, so it cannot be combined with --create.",
    oneFolder: "push takes one folder.",
    notAFolder: (path: string) => `${path} is not a folder.`,
    /** The heading of the paths that differ. */
    differs: (n: number) => `The cloud project differs from the folder in ${count(n, "path")}:`,
    pathAdded: (path: string) => `  ${path} is not in the cloud yet`,
    pathChanged: (path: string) => `  ${path} differs`,
    pathDeleted: (path: string) => `  ${path} is only in the cloud (pushing deletes it)`,
    /** The heading of the review by id. */
    review: "By id, what pushing changes in the diagrams:",
    identical: (id: string) =>
      `The cloud project ${id} already matches the folder; nothing to push.`,
    /** The question on a terminal; the answers it accepts are yes and no. */
    overwrite: "Overwrite these changes in the cloud? [y/N] ",
    retrying: "The cloud project changed while pushing; comparing again.",
    checkDiffers: (n: number) =>
      `${count(n, "path")} differ${n === 1 ? "s" : ""}; pushing would change the cloud project.`,
    created: (id: string, name: string) => `Created the cloud project ${id} (${name}).`,
    recorded: (path: string) => `Recorded the cloud project in ${path}.`,
    pushed: (id: string, written: number, deleted: number, uploaded: number) => {
      const parts = [`${count(written, "file")} written`];
      if (deleted > 0) parts.push(`${count(deleted, "file")} deleted`);
      if (uploaded > 0)
        parts.push(`${count(uploaded, "image or font", "images or fonts")} uploaded`);
      return `Pushed to the cloud project ${id}: ${parts.join(", ")}.`;
    },
    /** Where to see the project. */
    open: (url: string) => `Open it at ${url}`,
    /** A file or folder that is not sent. */
    notSent: (path: string, reason: string) => `warning: ${path} is not sent: ${reason}`,
    reasons: {
      path: "its name is not one the cloud keeps (ASCII letters, digits, spaces and . _ ( ) + @ -, no name starting with a dot, at most 12 names of 100 characters).",
      encoding: "it is not UTF-8 text.",
      unreadable: (why: string) => `it cannot be read (${why}).`,
    },
    /** Files the cloud does not keep, such as a PDF. */
    ignored: (n: number, examples: string) =>
      `${count(n, "file")} not kept in the cloud (it keeps diagrams, text, images and fonts): ${examples}`,
    /** A copy two people made at once in the cloud, which a push never touches. */
    collision: (path: string) =>
      `${path} is a copy that two people made at once in the cloud; the push leaves it alone. Settle it in the page.`,
  },
  pull: {
    tooMany: "pull takes an id and a folder at most.",
    version: (text: string) => `--version takes a version number, such as 3, not "${text}".`,
    wrote: (path: string) => `  wrote ${path}`,
    kept: (path: string) => `  kept ${path} (it differs from the cloud)`,
    inTheWay: (path: string) => `  kept ${path} (a folder is in its place)`,
    keptHint: "Pass --force to overwrite the files that differ.",
    loser: (path: string) =>
      `  skipped ${path}: a copy two people made at once in the cloud; settle it in the page`,
    recorded: (path: string) => `Recorded the cloud project in ${path}.`,
    noManifest:
      "The project has no project.json, so nothing in the folder records which cloud project it mirrors; give the id next time.",
    pulled: (
      id: string,
      version: number | null,
      folder: string,
      written: number,
      identical: number,
      kept: number,
    ) =>
      `Pulled ${version === null ? "the latest files" : `version ${version}`} of the cloud project ${id} into ${folder}: ${written} written, ${identical} already identical, ${kept} kept.`,
  },
  /** Why a failure of these commands (or of the service, as they meet it) happened, by stable code. */
  errors: {
    revisionMismatch:
      "the cloud project changed again while pushing, so nothing was overwritten. Run push again.",
    quotaFiles: "a project holds at most 2000 files.",
    quotaBinary: (path: string) =>
      path === ""
        ? "an image or font may be at most 10 MiB."
        : `${path} is larger than the 10 MiB an image or font may be.`,
    quotaStorage: "this account would go over its 200 MiB of storage.",
    quotaProjects: "this account already holds 100 projects.",
    docTooLarge: (path: string) =>
      path === ""
        ? "the texts of the folder are larger than the 16 MiB a project's document holds."
        : `${path} is larger than the 2 Mi characters a text file may have.`,
    pathInvalid: (path: string) =>
      path === "" ? "a path is not one the cloud keeps." : `${path} is not a path the cloud keeps.`,
    binaryInvalid: (path: string) =>
      `${path === "" ? "an upload" : path} is not a PNG, JPEG, GIF, WebP, woff2, ttf or otf by its bytes.`,
    pushDiffers: (n: number) =>
      `the cloud project differs from the folder in ${count(n, "path")}, so nothing was pushed. Run push on a terminal to be asked, or pass --force.`,
    pushDeclined: "nothing was pushed.",
    pushLinked: (project: string) =>
      `project.json already names the cloud project ${project}: push without --create, or remove its "cloud" setting to make another.`,
    pushStrict: (errors: number, unsent: number) => {
      const parts: string[] = [];
      if (errors > 0) parts.push(count(errors, "validation error"));
      if (unsent > 0) parts.push(`${count(unsent, "file")} that cannot be sent`);
      return `${parts.join(" and ")}, and --strict is given, so nothing was pushed.`;
    },
    pushManifestInvalid: (reason: string) =>
      `project.json is not a JSON object that can be edited (${reason}); fix it before --create. Nothing was created.`,
    pushManifestNotWritten: (project: string, host: string, reason: string) =>
      `the cloud project ${project} was created with the folder's text files, but project.json could not be updated (${reason}). Add "cloud": { "host": "${host}", "project": "${project}" } to it yourself, then run push.`,
    pushFileChanged: (path: string) =>
      `${path} changed while it was being pushed; nothing of it was kept. Run push again.`,
    pullNoProject:
      "no cloud project is named: give its id, or run pull in a folder whose project.json has a cloud setting.",
    pullOtherProject: (project: string, linked: string) =>
      `project.json already names the cloud project ${linked}; pulling ${project} here would mix the two. Pull into another folder.`,
    pullNotAFolder: (path: string) => `${path} exists and is not a folder.`,
    pullManifestNotUpdated: (reason: string) =>
      `project.json could not be updated with the cloud project (${reason}); the other files were written.`,
    pullWrite: (path: string, reason: string) => `cannot write ${path}: ${reason}`,
  },
};
