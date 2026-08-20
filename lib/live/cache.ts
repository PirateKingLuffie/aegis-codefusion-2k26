interface CacheEntry<T> {
  expiresAt: number;
  value: Promise<T>;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

export function withMemoryCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) return existing.value;

  const value = loader().catch((error) => {
    memoryCache.delete(key);
    throw error;
  });
  memoryCache.set(key, { expiresAt: now + ttlMs, value });

  if (memoryCache.size > 64) {
    for (const [cacheKey, entry] of memoryCache.entries()) {
      if (entry.expiresAt <= now) memoryCache.delete(cacheKey);
    }
  }
  return value;
}

export function clearLiveMemoryCache() {
  memoryCache.clear();
}
