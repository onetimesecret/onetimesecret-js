import type { RequestOptions } from "../http.ts";

/** Removes `undefined` values so they are not serialised as `null`. */
export function compact<T extends Record<string, unknown>>(
  value: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry;
  }
  return out as { [K in keyof T]: Exclude<T[K], undefined> };
}

/** Routes a resource path through `/api/v2/guest` when asked, `/api/v2` otherwise. */
export function prefix(guest: boolean | undefined, path: string): string {
  return guest ? `/api/v2/guest${path}` : `/api/v2${path}`;
}

/** Keeps only the transport-level request options, dropping resource flags such as `guest`. */
export function pick(options: RequestOptions): RequestOptions {
  return { signal: options.signal, timeoutMs: options.timeoutMs, headers: options.headers };
}
