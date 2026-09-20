// Small in-memory limiter for login/signup attempts. Fine for a single-process demo;
// use a shared store (Redis etc.) if this ever runs on several instances.
const hits = new Map<string, number[]>();

export function tooManyAttempts(key: string, limit = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > limit;
}
