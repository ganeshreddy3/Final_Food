import type { PostgrestError } from '@supabase/supabase-js';

export function isPostgrestError(err: unknown): err is PostgrestError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'message' in err &&
    typeof (err as PostgrestError).message === 'string'
  );
}

/** Readable message for toasts and forms (Supabase + generic errors). */
export function formatSupabaseError(err: unknown): string {
  if (isPostgrestError(err)) {
    const base = err.message;
    const detail = err.details && err.details !== err.message ? ` — ${err.details}` : '';
    return `${base}${detail}`.trim();
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

export function isUniqueViolation(err: unknown): boolean {
  return isPostgrestError(err) && err.code === '23505';
}
