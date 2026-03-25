export class SimpleLRU<K, V> {
  private cache = new Map<K, V>();

  constructor(private readonly max: number) {
    if (max < 1) throw new Error("max must be >= 1");
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;

    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.delete(key)) {
      // key existed;
    } else if (this.cache.size >= this.max) {
      const first = this.cache.keys().next();
      if (!first.done) this.cache.delete(first.value);
    }

    this.cache.set(key, value);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
