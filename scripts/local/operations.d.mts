export interface ArchiveResult {
  archive: string;
  files: number;
}
export function backup(data: string, archive: string): Promise<ArchiveResult>;
export function restore(data: string, archive: string): Promise<ArchiveResult>;
export function operate(
  operation: "backup" | "restore",
  args: string[],
  env?: Record<string, string | undefined>,
): Promise<void>;
