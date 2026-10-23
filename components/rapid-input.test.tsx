// @vitest-environment jsdom

vi.mock("@/lib/storage-lock", () => ({
  runWithStorageLock: (_name: string, operation: () => void) => Promise.resolve(operation()),
}))

import { StrictMode } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { translations } from "@/lib/i18n"
import { Game2048 } from "./game-2048"
import { BingoGame } from "./bingo-game"
import { SnakeGame } from "./snake-game"
import { TetrisGame } from "./tetris-game"
import { SudokuGame } from "./sudoku-game"
import { GomokuGame } from "./gomoku-game"
import { GoGame } from "./go-game"
import { ChessGame } from "./chess-game"
import { ChineseChessGame } from "./chinese-chess-game"

vi.mock("@/lib/locale-context", () => ({
  useLocale: () => ({ locale: "en", t: (key: keyof typeof translations.en) => translations.en[key] }),
}))
vi.mock("@/components/game-header", () => ({ GameHeader: () => null }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  localStorage.clear()
})

it("2048 processes a burst of direction events in order with the same score as separate events", () => {
  vi.spyOn(Math, "random").mockReturnValue(0)
  const keys = ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"]
  const snapshot = () => ({
    board: screen.getByRole("group").textContent,
    score: screen.getByRole("status").textContent,
  })
  render(<StrictMode><Game2048 /></StrictMode>)
  keys.forEach(key => fireEvent.keyDown(window, { key }))
  const expected = snapshot()
  cleanup()
  localStorage.clear()
  render(<StrictMode><Game2048 /></StrictMode>)
  act(() => keys.forEach(key => window.dispatchEvent(new KeyboardEvent("keydown", { key }))))
  expect(snapshot()).toEqual(expected)
})

it("Bingo burst draws contain no duplicates and stop exactly at 75", () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal("speechSynthesis", undefined)
  vi.spyOn(Math, "random").mockReturnValue(0)
  render(<StrictMode><BingoGame /></StrictMode>)
  const draw = screen.getByRole("button", { name: translations.en.drawNumber })
  act(() => { for (let i = 0; i < 100; i++) draw.click() })
  expect(screen.getByText("Drawn: 75 / 75 | Remaining: 0")).toBeTruthy()
  expect(screen.getAllByRole("img", { name: /, Drawn$/ })).toHaveLength(75)
  fireEvent.click(screen.getByRole("button", { name: translations.en.reset }))
  fireEvent.click(draw)
  expect(screen.getByText("Drawn: 1 / 75 | Remaining: 74")).toBeTruthy()
})

it("Bingo rapid auto-play toggles do not lose pause actions", () => {
  vi.useFakeTimers()
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  render(<BingoGame />)
  fireEvent.click(screen.getByRole("switch", { name: translations.en.autoDrawMode }))
  const start = screen.getByRole("button", { name: "Start" })
  act(() => { for (let i = 0; i < 20; i++) start.click() })
  expect(screen.queryByRole("button", { name: "Pause" })).toBeNull()
  act(() => vi.advanceTimersByTime(10000))
  expect(screen.getByText("Drawn: 0 / 75 | Remaining: 75")).toBeTruthy()
})

it.each([
  { name: "Snake", Component: SnakeGame, interval: 150 },
  { name: "Tetris", Component: TetrisGame, interval: 1000 },
])("$name restart begins a fresh tick interval", ({ Component, interval }) => {
  vi.useFakeTimers()
  vi.spyOn(Math, "random").mockReturnValue(0)
  render(<StrictMode><Component /></StrictMode>)
  fireEvent.click(screen.getByRole("button", { name: "Start" }))
  act(() => vi.advanceTimersByTime(interval - 1))
  fireEvent.click(screen.getByRole("button", { name: "Restart" }))
  const board = screen.getAllByRole("img")[0]
  const start = board.outerHTML
  act(() => vi.advanceTimersByTime(1))
  expect(board.outerHTML).toBe(start)
  act(() => vi.advanceTimersByTime(interval - 1))
  expect(board.outerHTML).not.toBe(start)
})

it("holding Space does not hard-drop successive Tetris pieces", () => {
  vi.useFakeTimers()
  render(<TetrisGame />)
  fireEvent.click(screen.getByRole("button", { name: "Start" }))
  fireEvent.keyDown(window, { key: " ", repeat: false })
  const board = screen.getAllByRole("img")[0]
  const firstDrop = board.innerHTML
  for (let i = 0; i < 15; i++) fireEvent.keyDown(window, { key: " ", repeat: true })
  expect(board.innerHTML).toBe(firstDrop)
  fireEvent.keyDown(window, { key: " ", repeat: false })
  expect(board.innerHTML).not.toBe(firstDrop)
})

it.each([
  { name: "Snake", Component: SnakeGame },
  { name: "Tetris", Component: TetrisGame },
])("$name keeps one loop after repeated restarts and rejects callbacks from an old round", ({ Component }) => {
  vi.useFakeTimers()
  const intervals = vi.spyOn(window, "setInterval")
  const view = render(<StrictMode><Component /></StrictMode>)
  fireEvent.click(screen.getByRole("button", { name: "Start" }))
  const oldTick = intervals.mock.calls.at(-1)![0] as () => void
  for (let i = 0; i < 20; i++) fireEvent.click(screen.getByRole("button", { name: "Restart" }))
  expect(vi.getTimerCount()).toBe(1)
  const board = screen.getAllByRole("img")[0]
  const fresh = board.outerHTML
  act(() => oldTick())
  expect(board.outerHTML).toBe(fresh)
  fireEvent.click(screen.getByRole("button", { name: "Pause" }))
  expect(vi.getTimerCount()).toBe(0)
  fireEvent.click(screen.getByRole("button", { name: "Resume" }))
  expect(vi.getTimerCount()).toBe(1)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it("a burst of Sudoku hints fills a cell once and consumes only one hint", () => {
  render(<SudokuGame />)
  const hint = screen.getByRole("button", { name: /Hint \(3\)/ })
  act(() => { for (let i = 0; i < 20; i++) hint.click() })
  expect(screen.getByRole("button", { name: /Hint \(2\)/ })).toHaveProperty("disabled", true)
  const empty = screen.getAllByRole("button", { name: /empty/ })[0]
  fireEvent.click(empty)
  fireEvent.click(screen.getByRole("button", { name: /Hint \(2\)/ }))
  expect(screen.getByRole("button", { name: /Hint \(1\)/ })).toBeTruthy()
})

it.each([
  { name: "Gomoku", Component: GomokuGame, moves: [[/^1, 1,/], [/^2, 2,/]] },
  { name: "Go", Component: GoGame, moves: [[/^1, 1,/], [/^2, 2,/]] },
  { name: "Chess", Component: ChessGame, moves: [[/^e2,/, /^e4,/], [/^e7,/, /^e5,/]] },
  { name: "Chinese chess", Component: ChineseChessGame, moves: [[/^7, 1,/, /^6, 1,/], [/^4, 1,/, /^5, 1,/]] },
])("$name keeps move history aligned with the board during repeated undo", ({ Component, moves }) => {
  render(<Component />)
  const cells = () => Array.from(screen.getByRole("group").querySelectorAll("button")).map(cell => cell.getAttribute("aria-label"))
  const initial = cells()
  for (const move of moves) {
    for (const name of move.slice(0, -1)) fireEvent.click(screen.getByRole("button", { name }))
    const destination = screen.getByRole("button", { name: move.at(-1)! })
    fireEvent.click(destination)
  }
  const undo = screen.getByRole("button", { name: "Undo" })
  act(() => { for (let i = 0; i < 20; i++) undo.click() })
  expect(undo).toHaveProperty("disabled", false)
  fireEvent.click(undo)
  expect(cells()).toEqual(initial)
  expect(undo).toHaveProperty("disabled", true)
})
