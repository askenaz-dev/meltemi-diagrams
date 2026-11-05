export const ROOT: string;
export const CLOUD: string;
export interface LocalSettings {
  origin: string;
  port: number;
  bind: string;
  data: string;
}
export function settings(env?: Record<string, string | undefined>): LocalSettings;
export interface InstanceMetadata {
  format: 1;
  origin: string;
  version: string;
}
export function validateInstanceMetadata(value: unknown): InstanceMetadata;
export function lockInstance(data: string): Promise<() => Promise<void>>;
export function digest(bytes: string | Uint8Array): string;
