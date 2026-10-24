// @vitest-environment jsdom

import { StrictMode } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { LocaleProvider, useLocale } from "@/lib/locale-context"
import { translations } from "@/lib/i18n"
import { Game2048 } from "./game-2048"
import { SnakeGame } from "./snake-game"
import { TetrisGame } from "./tetris-game"

vi.mock("next/navigation", () => ({ usePathname: () => "/2048" }))
vi.mock("@/lib/storage-lock", () => ({
  runWithStorageLock: (_name: string, operation: () => void) => Promise.resolve(operation()),
}))
vi.mock("@/components/game-header", () => ({ GameHeader: () => null }))
vi.mock("@/components/game-rules-dialog", () => ({ GameRulesDialog: () => null }))

function LanguageControls() {
  const { setLocale } = useLocale()
  return <>
    <button onClick={() => setLocale("th")}>Thai</button>
    <button onClick={() => setLocale("zh")}>Chinese</button>
  </>
}

let visualViewport: EventTarget
let orientation: EventTarget
let visibility: DocumentVisibilityState = "visible"

beforeEach(() => {
  localStorage.setItem("xm-games-locale", "en")
  vi.spyOn(Math, "random").mockReturnValue(0)
  visualViewport = new EventTarget()
  orientation = new EventTarget()
  vi.stubGlobal("visualViewport", visualViewport)
  vi.stubGlobal("screen", { orientation })
  visibility = "visible"
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  localStorage.clear()
})

it.each([
  { name: "window resize", interrupt: () => window.dispatchEvent(new Event("resize")) },
  { name: "legacy orientation change", interrupt: () => window.dispatchEvent(new Event("orientationchange")) },
  { name: "screen orientation change", interrupt: () => orientation.dispatchEvent(new Event("change")) },
  { name: "visual viewport resize", interrupt: () => visualViewport.dispatchEvent(new Event("resize")) },
  { name: "language change", interrupt: () => screen.getByRole("button", { name: "Thai" }).click() },
])("2048 discards a swipe interrupted by $name without resetting the board", ({ interrupt }) => {
  render(<StrictMode><LocaleProvider><LanguageControls /><Game2048 /></LocaleProvider></StrictMode>)
  const board = screen.getByRole("group", { name: "2048" })
  const cells = () => Array.from(board.children).map(cell => cell.textContent)
  fireEvent.keyDown(window, { key: "ArrowUp" })
  fireEvent.keyDown(window, { key: "ArrowLeft" })
  const before = cells()
  const first = { identifier: 7, clientX: 200, clientY: 200 }
  fireEvent.touchStart(board, { touches: [first] })
  act(interrupt)
  fireEvent.touchEnd(board, { changedTouches: [{ ...first, clientY: 300 }] })
  expect(cells()).toEqual(before)
  expect(screen.getByRole("status").textContent?.match(/\d+/g)).toEqual(["4", "4"])
  fireEvent.touchStart(board, { touches: [first] })
  fireEvent.touchEnd(board, { changedTouches: [{ ...first, clientY: 300 }] })
  expect(cells()).not.toEqual(before)
})

it.each([
  { name: "Snake", Component: SnakeGame, interval: 150 },
  { name: "Tetris", Component: TetrisGame, interval: 1000 },
])("$name retains its tick deadline and paused board across resize and language changes", ({ Component, interval }) => {
  vi.useFakeTimers()
  const intervals = vi.spyOn(window, "setInterval")
  const clearInterval = vi.spyOn(window, "clearInterval")
  render(<StrictMode><LocaleProvider><LanguageControls /><Component /></LocaleProvider></StrictMode>)
  fireEvent.click(screen.getByRole("button", { name: "Start" }))
  fireEvent.keyDown(window, { key: "ArrowUp" })
  act(() => vi.advanceTimersByTime(interval - 1))
  const board = screen.getAllByRole("img")[0]
  const before = board.innerHTML
  const loopStarts = intervals.mock.calls.length
  const loopId = intervals.mock.results.at(-1)!.value as number
  fireEvent.click(screen.getByRole("button", { name: "Thai" }))
  act(() => {
    window.dispatchEvent(new Event("resize"))
    orientation.dispatchEvent(new Event("change"))
    visualViewport.dispatchEvent(new Event("resize"))
  })
  expect(board.innerHTML).toBe(before)
  expect(intervals).toHaveBeenCalledTimes(loopStarts)
  expect(clearInterval).not.toHaveBeenCalledWith(loopId)
  act(() => vi.advanceTimersByTime(1))
  expect(board.innerHTML).not.toBe(before)
  fireEvent.click(screen.getByRole("button", { name: translations.th.pause }))
  const paused = board.innerHTML
  fireEvent.click(screen.getByRole("button", { name: "Chinese" }))
  fireEvent(window, new Event("resize"))
  act(() => vi.advanceTimersByTime(interval * 3))
  expect(board.innerHTML).toBe(paused)
  expect(screen.getByRole("button", { name: translations.zh.resume })).toBeTruthy()
  expect(clearInterval).toHaveBeenCalledWith(loopId)
})
