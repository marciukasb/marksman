import type { FieldConfig } from '../types';

export const fieldLabel = (field: FieldConfig) => field.label ?? field.name;

export function describeOpenError(err: unknown): string {
  switch ((err as { status?: number }).status) {
    case 401:
      return 'Token is invalid or expired.';
    case 403:
      return 'Token lacks access — it needs Contents and Actions read/write on this repo.';
    case 404:
      return 'Repo or .cms.json not found. Check the owner and repo name.';
    default:
      return `Could not connect: ${err instanceof Error ? err.message : String(err)}`;
  }
}
