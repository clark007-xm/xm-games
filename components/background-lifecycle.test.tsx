// @vitest-environment jsdom

import { StrictMode } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { translations } from "@/lib/i18n"
import { SnakeGame } from "./snake-game"
import { TetrisGame } from "./tetris-game"
import { BingoGame } from "./bingo-game"
import { MinesweeperGame } from "./minesweeper-game"

vi.mock("@/lib/locale-context", () => ({
  useLocale: () => ({ locale: "en", t: (key: keyof typeof translations.en) => translations.en[key] }),
}))
vi.mock("@/components/game-header", () => ({ GameHeader: () => null }))

let visibility: DocumentVisibilityState = "visible"
const changeVisibility = (value: DocumentVisibilityState) => {
  visibility = value
  fireEvent(document, new Event("visibilitychange"))
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility = "visible"
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility)
  vi.spyOn(Math, "random").mockReturnValue(0)
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  localStorage.clear()
})

it.each([
  { name: "Snake", Component: SnakeGame, interval: 150 },
  { name: "Tetris", Component: TetrisGame, interval: 1000 },
])("$name pauses in the background, rejects late ticks, and resumes only on request", ({ Component, interval }) => {
  const intervals = vi.spyOn(window, "setInterval")
  const view = render(<StrictMode><Component /></StrictMode>)
  fireEvent.click(screen.getByRole("button", { name: "Start" }))
  act(() => vi.advanceTimersByTime(interval))
  const board = screen.getAllByRole("img")[0]
  const oldTick = intervals.mock.calls.at(-1)![0] as () => void
  const before = board.outerHTML
  changeVisibility("hidden")
  fireEvent(window, new PageTransitionEvent("pagehide", { persisted: true }))
  act(() => { oldTick(); vi.advanceTimersByTime(10000) })
  expect(board.outerHTML).toBe(before)
  expect(vi.getTimerCount()).toBe(0)
  changeVisibility("visible")
  fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }))
  act(() => vi.advanceTimersByTime(interval * 2))
  expect(board.outerHTML).toBe(before)
  fireEvent.click(screen.getByRole("button", { name: "Resume" }))
  expect(vi.getTimerCount()).toBe(1)
  act(() => vi.advanceTimersByTime(interval))
  expect(board.outerHTML).not.toBe(before)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it("Bingo stops auto draws and queued speech while hidden and preserves the draw history", () => {
  const cancel = vi.fn()
  vi.stubGlobal("speechSynthesis", { cancel, speak: vi.fn() })
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} })
  render(<StrictMode><BingoGame /></StrictMode>)
  fireEvent.click(screen.getByRole("switch", { name: translations.en.autoDrawMode }))
  fireEvent.click(screen.getByRole("button", { name: "Start" }))
  act(() => vi.advanceTimersByTime(3000))
  expect(screen.getByText("Drawn: 1 / 75 | Remaining: 74")).toBeTruthy()
  cancel.mockClear()
  changeVisibility("hidden")
  expect(cancel).toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(9000))
  expect(screen.getByText("Drawn: 1 / 75 | Remaining: 74")).toBeTruthy()
  expect(vi.getTimerCount()).toBe(0)
  changeVisibility("visible")
  act(() => vi.advanceTimersByTime(3000))
  expect(screen.getByText("Drawn: 1 / 75 | Remaining: 74")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Start" }))
  act(() => vi.advanceTimersByTime(3000))
  expect(screen.getByText("Drawn: 2 / 75 | Remaining: 73")).toBeTruthy()
})

it("Minesweeper counts only visible play time across repeated visibility and BFCache transitions", () => {
  render(<StrictMode><MinesweeperGame /></StrictMode>)
  fireEvent.click(screen.getByRole("button", { name: "row 1, column 1, hidden" }))
  act(() => vi.advanceTimersByTime(2000))
  expect(screen.getByText("00:02")).toBeTruthy()
  const board = screen.getByRole("group", { name: /Minesweeper,/ })
  const before = board.innerHTML
  changeVisibility("hidden")
  act(() => vi.advanceTimersByTime(60000))
  expect(screen.getByText("00:02")).toBeTruthy()
  expect(vi.getTimerCount()).toBe(0)
  changeVisibility("visible")
  for (let i = 0; i < 3; i++) {
    fireEvent(window, new PageTransitionEvent("pagehide", { persisted: true }))
    act(() => vi.advanceTimersByTime(60000))
    expect(screen.getByText("00:02")).toBeTruthy()
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }))
    expect(vi.getTimerCount()).toBe(1)
  }
  act(() => vi.advanceTimersByTime(1000))
  expect(screen.getByText("00:03")).toBeTruthy()
  expect(board.innerHTML).toBe(before)
})

it.each([
  { name: "Snake", Component: SnakeGame },
  { name: "Tetris", Component: TetrisGame },
  { name: "Bingo", Component: BingoGame },
])("$name cannot start advancing while initially hidden", ({ name, Component }) => {
  visibility = "hidden"
  render(<StrictMode><Component /></StrictMode>)
  if (name === "Bingo") fireEvent.click(screen.getByRole("switch", { name: translations.en.autoDrawMode }))
  fireEvent.click(screen.getByRole("button", { name: "Start" }))
  expect(vi.getTimerCount()).toBe(0)
  changeVisibility("visible")
  act(() => vi.advanceTimersByTime(10000))
  expect(vi.getTimerCount()).toBe(0)
  expect(screen.getByRole("button", { name: "Start" })).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Start" }))
  expect(vi.getTimerCount()).toBe(1)
})

it.each([
  { name: "Snake", Component: SnakeGame },
  { name: "Tetris", Component: TetrisGame },
  { name: "Bingo", Component: BingoGame },
])("$name ignores ordinary window blur and pauses on pagehide even before visibility changes", ({ name, Component }) => {
  render(<StrictMode><Component /></StrictMode>)
  if (name === "Bingo") fireEvent.click(screen.getByRole("switch", { name: translations.en.autoDrawMode }))
  fireEvent.click(screen.getByRole("button", { name: "Start" }))
  fireEvent(window, new Event("blur"))
  expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy()
  expect(vi.getTimerCount()).toBe(1)
  act(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }))
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
  })
  expect(screen.getByRole("button", { name: name === "Bingo" ? "Start" : "Resume" })).toBeTruthy()
  expect(vi.getTimerCount()).toBe(0)
})

it.each([
  { name: "Snake", Component: SnakeGame },
  { name: "Tetris", Component: TetrisGame },
  { name: "Bingo", Component: BingoGame },
])("$name remains paused when hidden in the same batch as start or resume", ({ name, Component }) => {
  render(<StrictMode><Component /></StrictMode>)
  if (name === "Bingo") fireEvent.click(screen.getByRole("switch", { name: translations.en.autoDrawMode }))
  for (const action of ["Start", name === "Bingo" ? "Start" : "Resume"]) {
    const start = screen.getByRole("button", { name: action })
    act(() => {
      start.click()
      visibility = "hidden"
      document.dispatchEvent(new Event("visibilitychange"))
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }))
    })
    expect(vi.getTimerCount()).toBe(0)
    changeVisibility("visible")
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }))
    act(() => vi.advanceTimersByTime(5000))
    expect(vi.getTimerCount()).toBe(0)
    expect(screen.getByRole("button", { name: name === "Bingo" ? "Start" : "Resume" })).toBeTruthy()
  }
})

it("Minesweeper preserves fractional seconds and rejects stale callbacks after pagehide and reset", () => {
  const intervals = vi.spyOn(globalThis, "setInterval")
  const view = render(<MinesweeperGame />)
  fireEvent.click(screen.getByRole("button", { name: "row 1, column 1, hidden" }))
  const oldTick = intervals.mock.calls.at(-1)![0] as () => void
  act(() => vi.advanceTimersByTime(600))
  changeVisibility("hidden")
  act(() => { oldTick(); vi.advanceTimersByTime(60000) })
  expect(screen.getByText("00:00")).toBeTruthy()
  changeVisibility("visible")
  act(() => vi.advanceTimersByTime(500))
  expect(screen.getByText("00:01")).toBeTruthy()
  act(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }))
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
  })
  expect(vi.getTimerCount()).toBe(1)
  act(() => vi.advanceTimersByTime(1000))
  expect(screen.getByText("00:02")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Restart" }))
  act(() => { oldTick(); vi.advanceTimersByTime(10000) })
  expect(screen.getByText("00:00")).toBeTruthy()
  expect(vi.getTimerCount()).toBe(0)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
