"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { runWithStorageLock } from "./storage-lock"

function parseScore(value: string | null): number {
  if (value === null || !/^\d+$/.test(value)) return 0
  const score = Number(value)
  return Number.isSafeInteger(score) ? score : 0
}

export function useHighScore(storageKey: string) {
  const [highScore, setHighScore] = useState(0)
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  const live = useRef({
    highScore: 0, generation: 0, mounted: false, lastStored: null as string | null,
    pending: 0, deferredCleanups: new Set<() => void>(),
  })

  const publish = useCallback((value: number) => {
    live.current.highScore = value
    if (live.current.mounted) setHighScore(value)
  }, [])

  const recordScore = useCallback((score: number) => {
    if (!Number.isSafeInteger(score) || score <= 0) return
    const state = live.current
    const generation = live.current.generation
    publish(Math.max(live.current.highScore, score))
    const operation = () => {
      if (generation !== live.current.generation) return
      try {
        const saved = localStorage.getItem(storageKey)
        // A deletion can reach storage before its event reaches this tab.
        // Drop the old cached record, while retaining this newly earned score.
        const cached = saved === null && live.current.lastStored !== null ? 0 : live.current.highScore
        const next = Math.max(parseScore(saved), cached, score)
        if (parseScore(saved) < next) localStorage.setItem(storageKey, String(next))
        live.current.lastStored = String(next)
        publish(next)
        if (live.current.mounted) setStorageUnavailable(false)
      } catch {
        if (live.current.mounted) setStorageUnavailable(true)
      }
    }
    state.pending += 1
    void runWithStorageLock(storageKey, operation).catch(() => {
      if (live.current.mounted && generation === live.current.generation) setStorageUnavailable(true)
    }).finally(() => {
      state.pending -= 1
      if (state.pending === 0) {
        state.deferredCleanups.forEach(dispose => dispose())
        state.deferredCleanups.clear()
      }
    })
  }, [publish, storageKey])

  useEffect(() => {
    const state = live.current
    state.mounted = true
    const readScore = () => {
      try {
        const saved = localStorage.getItem(storageKey)
        if (saved === null) {
          // An empty store is normal before the first queued save. Only a
          // previously observed record disappearing implies a missed deletion.
          if (state.lastStored !== null) {
            state.generation += 1
            publish(0)
          }
        } else {
          publish(Math.max(live.current.highScore, parseScore(saved)))
        }
        live.current.lastStored = saved
        if (state.mounted && parseScore(saved) >= state.highScore) setStorageUnavailable(false)
      } catch {
        if (state.mounted) setStorageUnavailable(true)
      }
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== localStorage) return
      if (event.key !== null && event.key !== storageKey) return
      if (event.newValue === null) {
        // Explicit removal/clear cancels pending writes from the old record.
        live.current.generation += 1
        live.current.lastStored = null
        publish(0)
      }
      readScore()
    }
    const handleVisibility = () => {
      if (document.visibilityState === "visible") readScore()
    }

    readScore()
    window.addEventListener("storage", handleStorage)
    window.addEventListener("pageshow", readScore)
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      state.mounted = false
      const unsubscribe = () => window.removeEventListener("storage", handleStorage)
      // Earned points still save after an SPA navigation. Keep listening for an
      // explicit clear until those queued writes settle, then release everything.
      if (state.pending > 0) state.deferredCleanups.add(unsubscribe)
      else unsubscribe()
      window.removeEventListener("pageshow", readScore)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [publish, storageKey])

  return { highScore, storageUnavailable, recordScore }
}
