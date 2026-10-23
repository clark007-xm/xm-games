// @vitest-environment jsdom

vi.mock("@/lib/storage-lock", () => ({
  runWithStorageLock: (_name: string, operation: () => void) => Promise.resolve(operation()),
}))

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { translations } from "@/lib/i18n"
import { Game2048 } from "./game-2048"
import { SnakeGame } from "./snake-game"

vi.mock("@/lib/locale-context", () => ({
  useLocale: () => ({ locale: "zh", t: (key: keyof typeof translations.zh) => translations.zh[key] }),
}))
vi.mock("@/components/game-header", () => ({ GameHeader: () => null }))
vi.mock("@/components/game-rules-dialog", () => ({ GameRulesDialog: () => null }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  localStorage.clear()
})

describe("2048 direction controls", () => {
  const directions = [
    { key: "ArrowUp", label: "向上移动", cells: ["1, 2, 2", "1, 3, 2"] },
    { key: "ArrowDown", label: "向下移动", cells: ["4, 2, 2", "4, 3, 2"] },
    { key: "ArrowLeft", label: "向左移动", cells: ["2, 1, 2", "3, 1, 2"] },
    { key: "ArrowRight", label: "向右移动", cells: ["2, 4, 2", "3, 4, 2"] },
  ]

  for (const { key, label, cells } of directions) {
    it.each(["keyboard", "button"])(`${label} moves toward the correct edge with %s`, (control) => {
      vi.spyOn(Math, "random").mockReturnValue(0)
      render(<Game2048 />)

      if (control === "keyboard") fireEvent.keyDown(window, { key })
      else fireEvent.click(screen.getByRole("button", { name: label }))

      const board = within(screen.getByRole("group", { name: "2048" }))
      for (const name of cells) expect(board.getByRole("img", { name })).toBeTruthy()
    })
  }

  it.each([
    { dx: 0, dy: -80, cells: ["1, 2, 2", "1, 3, 2"] },
    { dx: 0, dy: 80, cells: ["4, 2, 2", "4, 3, 2"] },
    { dx: -80, dy: 0, cells: ["2, 1, 2", "3, 1, 2"] },
    { dx: 80, dy: 0, cells: ["2, 4, 2", "3, 4, 2"] },
  ])("moves one turn for a touch swipe ($dx, $dy)", ({ dx, dy, cells }) => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    render(<Game2048 />)
    const board = screen.getByRole("group", { name: "2048" })
    fireEvent.touchStart(board, { touches: [{ identifier: 1, clientX: 100, clientY: 100 }] })
    fireEvent.touchEnd(board, { changedTouches: [{ identifier: 1, clientX: 100 + dx, clientY: 100 + dy }] })
    for (const name of cells) expect(within(board).getByRole("img", { name })).toBeTruthy()
    expect(within(board).getAllByRole("img").filter(cell => cell.textContent)).toHaveLength(3)
  })

  it("ignores taps, cancelled swipes, and multi-touch gestures", () => {
    render(<Game2048 />)
    const board = screen.getByRole("group", { name: "2048" })
    const before = board.innerHTML
    const first = { identifier: 1, clientX: 100, clientY: 100 }
    fireEvent.touchStart(board, { touches: [first] })
    fireEvent.touchEnd(board, { changedTouches: [{ ...first, clientX: 110 }] })
    fireEvent.touchStart(board, { touches: [first] })
    fireEvent.touchCancel(board)
    fireEvent.touchEnd(board, { changedTouches: [{ ...first, clientX: 200 }] })
    fireEvent.touchStart(board, { touches: [first] })
    fireEvent.touchStart(board, { touches: [first, { ...first, identifier: 2 }] })
    fireEvent.touchEnd(board, { changedTouches: [{ ...first, clientX: 200 }] })
    expect(board.innerHTML).toBe(before)
  })
})

describe("optional high-score storage", () => {
  it.each([
    { name: "2048", Component: Game2048 },
    { name: "snake", Component: SnakeGame },
  ])("keeps $name playable when storage reads are denied", ({ Component }) => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError")
    })

    expect(() => render(<Component />)).not.toThrow()
    expect(screen.getByRole("main")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toBe(translations.zh.highScoreStorageError)
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0)
  })

  it("keeps 2048 scores and moves working when storage is full", () => {
    const save = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError")
    })
    vi.spyOn(Math, "random").mockReturnValue(0)
    render(<Game2048 />)

    fireEvent.keyDown(window, { key: "ArrowUp" })
    fireEvent.keyDown(window, { key: "ArrowLeft" })

    expect(save).toHaveBeenCalledWith("2048-best", "4")
    expect(screen.getByRole("alert").textContent).toBe(translations.zh.highScoreStorageError)
    expect(screen.getByRole("status").textContent).toBe("分数4最高分4")
    expect(screen.getByRole("img", { name: "1, 1, 4" })).toBeTruthy()
    fireEvent.keyDown(window, { key: "ArrowDown" })
    expect(screen.getByRole("img", { name: "4, 1, 4" })).toBeTruthy()
  })

  it("keeps snake running after earning a high score when storage is full", () => {
    vi.useFakeTimers()
    vi.spyOn(Math, "random").mockReturnValue(210.5 / 399)
    const save = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError")
    })
    render(<SnakeGame />)
    fireEvent.click(screen.getByRole("button", { name: translations.zh.start }))

    act(() => vi.advanceTimersByTime(150))

    expect(save).toHaveBeenCalledWith("snakeHighScore", "10")
    expect(screen.getByRole("alert").textContent).toBe(translations.zh.highScoreStorageError)
    expect(screen.getByRole("status").textContent).toBe("分数10最高分10")
    expect(screen.getByRole("button", { name: translations.zh.pause })).toBeTruthy()
    act(() => vi.advanceTimersByTime(150))
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Head: 13, 11")
  })
})
