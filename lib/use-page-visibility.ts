"use client"

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"

/** Treat hidden documents and pages stored in BFCache as inactive, not ordinary blur. */
export function usePageVisibility(onHidden?: () => void) {
  const [visibility, setVisibility] = useState({ isVisible: true, version: 0 })
  const visibleRef = useRef(true)
  const notifyHidden = useEffectEvent(() => onHidden?.())
  const isPageVisible = useCallback(
    () => visibleRef.current && document.visibilityState !== "hidden",
    [],
  )

  useEffect(() => {
    let pageHidden = false
    const update = (visible: boolean) => {
      const wasVisible = visibleRef.current
      visibleRef.current = visible
      if (wasVisible !== visible) {
        setVisibility(previous => ({ isVisible: visible, version: previous.version + 1 }))
      }
      if (!visible && wasVisible) notifyHidden()
    }
    const visibilityChange = () => update(!pageHidden && document.visibilityState !== "hidden")
    const pageHide = () => { pageHidden = true; update(false) }
    const pageShow = () => { pageHidden = false; visibilityChange() }

    document.addEventListener("visibilitychange", visibilityChange)
    window.addEventListener("pagehide", pageHide)
    window.addEventListener("pageshow", pageShow)
    visibilityChange()

    return () => {
      visibleRef.current = false
      document.removeEventListener("visibilitychange", visibilityChange)
      window.removeEventListener("pagehide", pageHide)
      window.removeEventListener("pageshow", pageShow)
    }
  }, [])

  return { isVisible: visibility.isVisible, visibilityVersion: visibility.version, isPageVisible }
}
