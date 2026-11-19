const KEYS = ["data", "items", "results", "signals", "robots", "rows"] as const;

export function unwrap<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === "object") {
    for (const k of KEYS) {
      const v = (res as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as T[];
      if (v && typeof v === "object") {
        const inner = unwrap<T>(v); // ex.: { data: { items: [] } }
        if (inner.length) return inner;
      }
    }
  }
  return [];
}
