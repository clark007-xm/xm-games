// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { translations } from "@/lib/i18n"
import { Game2048 } from "./game-2048"
import { SnakeGame } from "./snake-game"
import { TetrisGame } from "./tetris-game"
import { SudokuGame } from "./sudoku-game"
import { BingoGame } from "./bingo-game"

vi.mock("@/lib/locale-context", () => ({
  useLocale: () => ({ locale: "en", t: (key: keyof typeof translations.en) => translations.en[key] }),
}))
vi.mock("@/components/game-header", () => ({ GameHeader: () => <button role="combobox" aria-expanded={false} aria-controls="language-options">Language</button> }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  localStorage.clear()
})

describe("game shortcut ownership", () => {
  it("2048 accepts uppercase WASD but leaves dialog, language and modified keys alone", () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    render(<Game2048 />)
    const board = screen.getByRole("group", { name: "2048" })
    const before = board.innerHTML
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" })
    fireEvent.keyDown(window, { key: "a", ctrlKey: true })
    fireEvent.click(screen.getByRole("button", { name: "How to Play" }))
    fireEvent.keyDown(screen.getByRole("button", { name: "Close" }), { key: "ArrowLeft" })
    expect(board.innerHTML).toBe(before)
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    fireEvent.keyDown(window, { key: "W", shiftKey: true })
    expect(screen.getByRole("img", { name: "1, 2, 2" })).toBeTruthy()
    expect(screen.getByRole("img", { name: "1, 3, 2" })).toBeTruthy()
  })

  it("Tetris leaves Space activation on the pause button to the browser", () => {
    vi.useFakeTimers()
    render(<TetrisGame />)
    fireEvent.click(screen.getByRole("button", { name: "Start" }))
    const board = screen.getAllByRole("img")[0]
    const before = board.innerHTML
    expect(fireEvent.keyDown(screen.getByRole("button", { name: "Pause" }), { key: " " })).toBe(true)
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowLeft" })
    expect(board.innerHTML).toBe(before)
    fireEvent.keyDown(window, { key: " " })
    expect(board.innerHTML).not.toBe(before)
  })

  it("Snake language navigation does not steer the snake", () => {
    vi.useFakeTimers()
    render(<SnakeGame />)
    fireEvent.click(screen.getByRole("button", { name: "Start" }))
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowUp" })
    act(() => vi.advanceTimersByTime(150))
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Head: 12, 11")
  })
})

describe("arcade pause, resume and restart", () => {
  it.each([
    { name: "Snake", Component: SnakeGame },
    { name: "Tetris", Component: TetrisGame },
  ])("$name freezes while paused, resumes, and restarts even at zero score", ({ Component }) => {
    vi.useFakeTimers()
    vi.spyOn(Math, "random").mockReturnValue(0)
    render(<Component />)
    fireEvent.click(screen.getByRole("button", { name: "Start" }))
    expect(screen.getByRole("button", { name: "Restart" })).toBeTruthy()
    act(() => vi.advanceTimersByTime(1000))
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    const board = screen.getAllByRole("img")[0]
    const snapshot = () => board.outerHTML
    const paused = snapshot()
    fireEvent.keyDown(window, { key: "ArrowDown" })
    act(() => vi.advanceTimersByTime(5000))
    expect(snapshot()).toBe(paused)
    fireEvent.click(screen.getByRole("button", { name: "Resume" }))
    act(() => vi.advanceTimersByTime(1000))
    expect(snapshot()).not.toBe(paused)
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    fireEvent.click(screen.getByRole("button", { name: "Restart" }))
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy()
    expect(board.getAttribute("aria-label")).toContain("Score: 0")
    expect(snapshot()).not.toBe(paused)
  })
})

it("Sudoku spends hints only on empty or incorrect editable cells and resets the allowance", () => {
  render(<SudokuGame />)
  fireEvent.click(screen.getByRole("button", { name: "Hint (3)" }))
  expect((screen.getByRole("button", { name: "Hint (2)" }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "Hint (2)" }))
  expect(screen.queryByRole("button", { name: "Hint (1)" })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "empty" }))
  expect((screen.getByRole("button", { name: "Hint (2)" }) as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(screen.getByRole("button", { name: "Hint (2)" }))
  expect(screen.getByRole("button", { name: "Hint (1)" })).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Restart" }))
  expect((screen.getByRole("button", { name: "Hint (3)" }) as HTMLButtonElement).disabled).toBe(false)
})

it("Bingo pauses, continues without duplicates, stops when leaving auto mode and resets its timer", () => {
  vi.useFakeTimers()
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(Math, "random").mockReturnValue(0)
  render(<BingoGame />)
  fireEvent.click(screen.getByRole("switch", { name: translations.en.voiceBroadcast }))
  fireEvent.click(screen.getByRole("switch", { name: translations.en.autoDrawMode }))
  fireEvent.click(screen.getByRole("button", { name: "Start" }))
  act(() => vi.advanceTimersByTime(3000))
  expect(screen.getByText("Drawn: 1 / 75 | Remaining: 74")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Pause" }))
  act(() => vi.advanceTimersByTime(6000))
  expect(screen.getByText("Drawn: 1 / 75 | Remaining: 74")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Start" }))
  act(() => vi.advanceTimersByTime(3000))
  expect(screen.getByText("Drawn: 2 / 75 | Remaining: 73")).toBeTruthy()
  expect(screen.getByRole("img", { name: "B 1, Drawn" })).toBeTruthy()
  expect(screen.getByRole("img", { name: "B 2, Drawn" })).toBeTruthy()
  fireEvent.click(screen.getByRole("switch", { name: translations.en.autoDrawMode }))
  act(() => vi.advanceTimersByTime(6000))
  expect(screen.getByText("Drawn: 2 / 75 | Remaining: 73")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: translations.en.reset }))
  act(() => vi.advanceTimersByTime(6000))
  expect(screen.getByText("Drawn: 0 / 75 | Remaining: 75")).toBeTruthy()
})
