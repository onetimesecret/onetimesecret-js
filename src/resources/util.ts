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
