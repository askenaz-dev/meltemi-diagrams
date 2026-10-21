/**
 * The words of presence (`live-collaboration`): the header's list of the people who are in the
 * open project, with the file each has open, and what stands in for a name nobody gave. The page's
 * `en` catalog holds it as `presence`; `cloud-presence-es.ts` has the same entries in Spanish.
 */
export const presence = {
  /** The accessible name of the header's list. */
  group: "People in this project",
  /** What a person who has no name is called. */
  unnamed: "Someone",
  /** The accessible name of a person's button: who, and the file they have open if any. */
  person: (name: string, file: string | undefined): string =>
    file === undefined ? name : `${name}, in ${file}`,
  /** The button's tooltip: it opens the file the person has open. */
  go: (file: string): string => `Go to ${file}`,
  /** The tooltip of a person whose file this page does not have. */
  noFile: "No file of this project open",
  /** The overflow chip, when more people are here than the header lists. */
  more: (count: number): string => `+${count}`,
  moreName: (count: number): string => `${count} more people`,
  moreMenu: "More people in this project",
};
