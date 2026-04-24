interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

let hits = 0;
let misses = 0;

export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    hits++;
    return Promise.resolve(entry.data as T);
  }
  misses++;
  return fn().then((data) => {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    return data;
  });
}

export function invalidate(...keys: string[]): void {
  for (const key of keys) {
    cache.delete(key);
  }
}

export function invalidatePattern(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

export function getMetrics() {
  return { hits, misses, size: cache.size };
}

export function resetMetrics(): void {
  hits = 0;
  misses = 0;
}
