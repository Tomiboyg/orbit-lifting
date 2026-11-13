/**
 * Tiny promise wrapper around IndexedDB (the role `idb` plays, kept in-repo).
 * The active workout lives here — never localStorage, never React state alone.
 * All writes go through single transactions so a kill mid-write cannot
 * corrupt the record (spec 11.5).
 */

const DB_NAME = 'orbit-lifting'
const DB_VERSION = 1

export const KV_ACTIVE_WORKOUT = 'activeWorkout'
export const KV_LAST_SEEN = 'lastSeenDevice'

let dbPromise: Promise<IDBDatabase> | null = null

export function openDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'id' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
      req.onblocked = () => reject(new Error('IndexedDB blocked'))
    })
  }
  return dbPromise
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase()
  const tx = db.transaction('kv', 'readonly')
  return reqAsPromise(tx.objectStore('kv').get(key) as IDBRequest<T | undefined>)
}

/** Atomic put: one transaction, whole record. */
export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction('kv', 'readwrite')
  tx.objectStore('kv').put(value, key)
  await done(tx)
}

export async function kvDelete(key: string): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction('kv', 'readwrite')
  tx.objectStore('kv').delete(key)
  await done(tx)
}

export interface OutboxEntry {
  id: string // workout id — one entry per workout, replaced on change
  kind: 'workout-sync'
  createdAt: number
  attempts: number
  lastAttempt?: number
  /** Latest snapshot to upsert; replaced on every enqueue. */
  payload?: unknown
}

export async function outboxAll(): Promise<OutboxEntry[]> {
  const db = await openDatabase()
  const tx = db.transaction('outbox', 'readonly')
  return reqAsPromise(tx.objectStore('outbox').getAll() as IDBRequest<OutboxEntry[]>)
}

export async function outboxPut(entry: OutboxEntry): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction('outbox', 'readwrite')
  tx.objectStore('outbox').put(entry)
  await done(tx)
}

export async function outboxDelete(id: string): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction('outbox', 'readwrite')
  tx.objectStore('outbox').delete(id)
  await done(tx)
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB tx failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB tx aborted'))
  })
}

/** Ask the browser to persist storage so iOS Safari is less likely to evict data. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true
      return await navigator.storage.persist()
    }
  } catch {
    // Not supported — proceed without.
  }
  return false
}
