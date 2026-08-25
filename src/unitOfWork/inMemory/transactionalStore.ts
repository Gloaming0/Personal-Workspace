export interface InMemoryTransactionalStore {
  createTransactionSnapshot(): unknown
  restoreTransactionSnapshot(snapshot: unknown): void
}

export function createMapSnapshot<K, V>(map: ReadonlyMap<K, V>): [K, V][] {
  return structuredClone([...map.entries()])
}

export function restoreMapSnapshot<K, V>(
  map: Map<K, V>,
  snapshot: unknown,
): void {
  map.clear()
  for (const [key, value] of snapshot as [K, V][]) map.set(key, value)
}
