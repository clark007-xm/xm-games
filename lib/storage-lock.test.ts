// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest"

beforeEach(() => { vi.resetModules() })
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mockFallbackDatabase() {
  const readRequest: { onsuccess: (() => void) | null } = { onsuccess: null }
  const transaction: {
    objectStore: ReturnType<typeof vi.fn>
    abort: ReturnType<typeof vi.fn>
    error: DOMException | null
    onerror: (() => void) | null
    onabort: (() => void) | null
  } = {
    objectStore: vi.fn(() => ({ get: vi.fn(() => readRequest) })),
    abort: vi.fn(), error: null, onerror: null, onabort: null,
  }
  const database = { transaction: vi.fn(() => transaction), createObjectStore: vi.fn(), close: vi.fn() }
  const opening: {
    result: typeof database
    error: DOMException | null
    onsuccess: (() => void) | null
    onerror: (() => void) | null
    onblocked: (() => void) | null
    onupgradeneeded: (() => void) | null
  } = { result: database, error: null, onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null }
  vi.stubGlobal("navigator", Object.create(navigator, { locks: { value: undefined } }))
  vi.stubGlobal("indexedDB", { open: vi.fn(() => opening) })
  return { opening, database, transaction, readRequest }
}

it("uses a shared, namespaced exclusive Web Lock", async () => {
  const request = vi.fn((_name: string, operation: () => void) => Promise.resolve(operation()))
  vi.stubGlobal("navigator", Object.create(navigator, { locks: { value: { request } } }))
  const { runWithStorageLock } = await import("./storage-lock")
  const operation = vi.fn()
  await runWithStorageLock("2048-best", operation)
  expect(request).toHaveBeenCalledWith("xm-games:2048-best", operation)
  expect(operation).toHaveBeenCalledTimes(1)
})

it("holds the IndexedDB readwrite transaction while applying the fallback mutation", async () => {
  const { opening, database, readRequest } = mockFallbackDatabase()
  const { runWithStorageLock } = await import("./storage-lock")
  const operation = vi.fn()
  const saved = runWithStorageLock("snakeHighScore", operation)
  expect(operation).not.toHaveBeenCalled()
  opening.onupgradeneeded!()
  opening.onsuccess!()
  await Promise.resolve()
  expect(database.createObjectStore).toHaveBeenCalledWith("locks")
  expect(database.transaction).toHaveBeenCalledWith("locks", "readwrite")
  expect(operation).not.toHaveBeenCalled()
  readRequest.onsuccess!()
  await saved
  expect(operation).toHaveBeenCalledTimes(1)
})

it("does not replay a successful localStorage mutation if the fallback transaction later aborts", async () => {
  const { opening, transaction, readRequest } = mockFallbackDatabase()
  const { runWithStorageLock } = await import("./storage-lock")
  const operation = vi.fn()
  const saved = runWithStorageLock("episodes", operation)
  opening.onsuccess!()
  await Promise.resolve()
  readRequest.onsuccess!()
  transaction.onabort!()
  await expect(saved).resolves.toBeUndefined()
  expect(operation).toHaveBeenCalledTimes(1)
})

it("rejects without applying a mutation when the fallback cannot acquire its transaction", async () => {
  const { opening, transaction } = mockFallbackDatabase()
  const { runWithStorageLock } = await import("./storage-lock")
  const operation = vi.fn()
  const saved = runWithStorageLock("episodes", operation)
  opening.onsuccess!()
  await Promise.resolve()
  transaction.onabort!()
  await expect(saved).rejects.toThrow("Storage lock unavailable")
  expect(operation).not.toHaveBeenCalled()
})

it("reports unavailable persistence instead of making an unlocked competing write", async () => {
  vi.stubGlobal("navigator", Object.create(navigator, { locks: { value: undefined } }))
  vi.stubGlobal("indexedDB", undefined)
  const { runWithStorageLock } = await import("./storage-lock")
  const operation = vi.fn()
  await expect(runWithStorageLock("score", operation)).rejects.toThrow("Storage lock unavailable")
  expect(operation).not.toHaveBeenCalled()
})
