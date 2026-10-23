const DATABASE_NAME = "xm-games-storage-locks"
const STORE_NAME = "locks"
let databasePromise: Promise<IDBDatabase> | undefined

function openLockDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        databasePromise = undefined
      }
      resolve(database)
    }
    request.onerror = () => reject(request.error ?? new Error("Storage lock unavailable"))
    request.onblocked = () => reject(new Error("Storage lock unavailable"))
  })
  databasePromise = opening
  void opening.catch(() => {
    if (databasePromise === opening) databasePromise = undefined
  })
  return opening
}

/** Serialize synchronous localStorage read-modify-write operations across tabs. */
export function runWithStorageLock(name: string, operation: () => void): Promise<void> {
  try {
    if (navigator.locks?.request) {
      return navigator.locks.request(`xm-games:${name}`, operation)
    }
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new Error("Storage lock unavailable"))
    }
  } catch (error) {
    return Promise.reject(error)
  }

  return openLockDatabase().then(database => new Promise<void>((resolve, reject) => {
    // Readwrite transactions over the same store are exclusive across tabs.
    // The localStorage operation must run synchronously while this is active.
    const transaction = database.transaction(STORE_NAME, "readwrite")
    let applied = false
    transaction.objectStore(STORE_NAME).get(name).onsuccess = () => {
      try {
        operation()
        applied = true
        resolve()
      } catch (error) {
        transaction.abort()
        reject(error)
      }
    }
    const fail = () => {
      // localStorage does not roll back if the lock transaction later aborts.
      // Never retry an already applied mutation (e.g. an episode increment).
      if (!applied) reject(transaction.error ?? new Error("Storage lock unavailable"))
    }
    transaction.onerror = fail
    transaction.onabort = fail
  }))
}
