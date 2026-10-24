// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { LocaleProvider, useLocale } from "@/lib/locale-context"
import { translations, type Locale } from "@/lib/i18n"
import { BingoGame } from "./bingo-game"
import { BingoCards } from "./bingo-cards"
import { Game2048 } from "./game-2048"
import { GomokuGame } from "./gomoku-game"
import { GoGame } from "./go-game"
import { ChessGame } from "./chess-game"
import { ChineseChessGame } from "./chinese-chess-game"
import { ReversiGame } from "./reversi-game"
import { SudokuGame } from "./sudoku-game"
import { SnakeGame } from "./snake-game"
import { TetrisGame } from "./tetris-game"
import { MinesweeperGame } from "./minesweeper-game"
import { AnimeTracker } from "./anime-tracker"

vi.mock("next/navigation", () => ({ usePathname: () => "/bingo" }))
vi.mock("@/components/game-header", () => ({ GameHeader: ({ actions }: { actions: ReactNode }) => <>{actions}</> }))
vi.mock("@/lib/storage-lock", () => ({
  runWithStorageLock: (_name: string, operation: () => void) => Promise.resolve(operation()),
}))

function LanguageControls() {
  const { setLocale } = useLocale()
  return <nav aria-label="Test language">{(["zh", "en", "th"] as Locale[]).map(locale =>
    <button key={locale} onClick={() => setLocale(locale)}>{locale}</button>)}</nav>
}

function mount(children: ReactNode) {
  return render(<LocaleProvider><LanguageControls />{children}</LocaleProvider>)
}

function language(locale: Locale) {
  fireEvent.click(within(screen.getByRole("navigation", { name: "Test language" })).getByRole("button", { name: locale }))
}

beforeEach(() => {
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

it("keeps Bingo's pending draw deadline while using the newly selected speech language", () => {
  vi.useFakeTimers()
  const speak = vi.fn()
  vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn() })
  vi.stubGlobal("SpeechSynthesisUtterance", class { lang = ""; constructor(public text: string) {} })
  mount(<BingoGame />)
  fireEvent.click(screen.getByRole("switch", { name: translations.zh.autoDrawMode }))
  fireEvent.click(screen.getByRole("button", { name: translations.zh.start }))
  act(() => vi.advanceTimersByTime(2999))
  language("en")
  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByText("Drawn: 1 / 75 | Remaining: 74")).toBeTruthy()
  expect(speak.mock.calls[0][0].lang).toBe("en-US")
  act(() => vi.advanceTimersByTime(2999))
  language("th")
  act(() => vi.advanceTimersByTime(1))
  expect(speak.mock.calls[1][0].lang).toBe("th-TH")
  expect(speak).toHaveBeenCalledTimes(2)
})

it("translates existing Bingo card names without regenerating their numbers or marks", () => {
  mount(<BingoCards />)
  fireEvent.click(screen.getByRole("button", { name: translations.zh.addCard }))
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1" } })
  fireEvent.click(screen.getByRole("button", { name: translations.zh.confirm }))
  const numbers = screen.getByRole("group", { name: "卡片 1" }).textContent
  language("en")
  const englishCard = screen.getByRole("group", { name: "Card 1" })
  expect(englishCard.textContent).toBe(numbers)
  expect(within(englishCard).getByRole("img", { name: "1, Drawn" })).toBeTruthy()
  language("th")
  const thaiCard = screen.getByRole("group", { name: `${translations.th.card} 1` })
  expect(thaiCard.textContent).toBe(numbers)
  expect(within(thaiCard).getByRole("img", { name: `1, ${translations.th.drawn}` })).toBeTruthy()
})

it("does not announce an old Bingo win again when switching language", () => {
  const speak = vi.fn()
  vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn() })
  vi.stubGlobal("SpeechSynthesisUtterance", class { lang = ""; constructor(public text: string) {} })
  mount(<BingoCards />)
  fireEvent.click(screen.getByRole("button", { name: translations.zh.addCard }))
  for (const value of [1, 16, 31, 46, 61]) {
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: String(value) } })
    fireEvent.click(screen.getByRole("button", { name: translations.zh.confirm }))
  }
  expect(speak).toHaveBeenCalledTimes(1)
  language("en")
  language("th")
  expect(speak).toHaveBeenCalledTimes(1)
  expect(screen.getAllByText("BINGO!")).toHaveLength(1)
  fireEvent.click(screen.getByRole("button", { name: translations.th.addCard }))
  expect(speak).toHaveBeenCalledTimes(2)
  expect(speak.mock.calls[1][0]).toMatchObject({ lang: "th-TH", text: `${translations.th.card} 2 บิงโก!` })
})

it("restarts an active recognizer in the new language and ignores results from the old session", () => {
  vi.useFakeTimers()
  const recognizers: FakeRecognition[] = []
  class FakeRecognition {
    lang = ""
    activeLanguage = ""
    onstart: (() => void) | null = null
    onend: (() => void) | null = null
    onresult: ((event: SpeechRecognitionEvent) => void) | null = null
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null
    start = vi.fn(() => { this.activeLanguage = this.lang; this.onstart?.() })
    abort = vi.fn()
    constructor() { recognizers.push(this) }
  }
  vi.stubGlobal("SpeechRecognition", FakeRecognition)
  mount(<BingoCards />)
  const recognition = recognizers[0]
  fireEvent.click(screen.getByRole("button", { name: translations.zh.addCard }))
  fireEvent.click(screen.getByRole("button", { name: translations.zh.startListening }))
  expect(recognition.activeLanguage).toBe("zh-CN")
  language("en")
  expect(recognition.abort).toHaveBeenCalledTimes(1)
  const result = { resultIndex: 0, results: [{ 0: { transcript: "1 16 31 46 61" }, isFinal: true }] } as unknown as SpeechRecognitionEvent
  act(() => recognition.onresult?.(result))
  expect(screen.queryByText("BINGO!")).toBeNull()
  act(() => { recognition.onend?.(); vi.advanceTimersByTime(150) })
  expect(recognition.activeLanguage).toBe("en-US")
  expect(recognition.start).toHaveBeenCalledTimes(2)
  act(() => recognition.onresult?.(result))
  expect(screen.getByText("BINGO!")).toBeTruthy()
  language("th")
  fireEvent.click(screen.getByRole("button", { name: translations.th.stopListening }))
  act(() => { recognition.onend?.(); vi.advanceTimersByTime(1000) })
  expect(recognition.start).toHaveBeenCalledTimes(2)
})

function boardPosition(board = screen.getByRole("group")) {
  return Array.from(board.querySelectorAll("button,[role='img']")).map(cell => ({
    className: cell.className,
    disabled: cell.getAttribute("disabled"),
    selected: cell.getAttribute("aria-pressed"),
    current: cell.getAttribute("aria-current"),
    numbers: cell.textContent?.match(/\d+/g),
    pieces: Array.from(cell.querySelectorAll("*")).map(piece => piece.getAttribute("class")),
  }))
}

it.each([
  { name: "2048", Component: Game2048, play: () => { fireEvent.keyDown(window, { key: "ArrowUp" }); fireEvent.keyDown(window, { key: "ArrowLeft" }) } },
  { name: "Gomoku", Component: GomokuGame, play: () => fireEvent.click(screen.getByRole("button", { name: /^8, 8,/ })) },
  { name: "Go", Component: GoGame, play: () => fireEvent.click(screen.getByRole("button", { name: /^1, 1,/ })) },
  { name: "Chess", Component: ChessGame, play: () => { fireEvent.click(screen.getByRole("button", { name: /^e2,/ })); fireEvent.click(screen.getByRole("button", { name: /^e4,/ })) } },
  { name: "Chinese chess", Component: ChineseChessGame, play: () => { fireEvent.click(screen.getByRole("button", { name: /^7, 1,/ })); fireEvent.click(screen.getByRole("button", { name: /^6, 1,/ })) } },
  { name: "Reversi", Component: ReversiGame, play: () => fireEvent.click(screen.getByRole("button", { name: /^3, 4,/ })) },
  { name: "Sudoku", Component: SudokuGame, play: () => fireEvent.click(screen.getByRole("button", { name: /提示 \(3\)/ })) },
])("$name preserves its played position when switching Chinese, English and Thai", ({ Component, play }) => {
  mount(<Component />)
  const initial = boardPosition()
  play()
  const played = boardPosition()
  expect(played).not.toEqual(initial)
  for (const locale of ["en", "th", "zh"] as const) {
    language(locale)
    expect(boardPosition()).toEqual(played)
  }
})

it.each([
  { name: "Snake", Component: SnakeGame, interval: 150 },
  { name: "Tetris", Component: TetrisGame, interval: 1000 },
])("$name keeps its tick deadline and pause state through a language switch", ({ Component, interval }) => {
  vi.useFakeTimers()
  mount(<Component />)
  fireEvent.click(screen.getByRole("button", { name: translations.zh.start }))
  const board = screen.getAllByRole("img")[0]
  const initial = board.innerHTML
  act(() => vi.advanceTimersByTime(interval - 1))
  language("en")
  act(() => vi.advanceTimersByTime(1))
  expect(board.innerHTML).not.toBe(initial)
  fireEvent.click(screen.getByRole("button", { name: translations.en.pause }))
  const paused = board.innerHTML
  language("th")
  act(() => vi.advanceTimersByTime(interval * 5))
  expect(board.innerHTML).toBe(paused)
  expect(screen.getByRole("button", { name: translations.th.resume })).toBeTruthy()
})

it("Minesweeper keeps the revealed board and running clock when switching language", () => {
  vi.useFakeTimers()
  const intervals = vi.spyOn(window, "setInterval")
  mount(<MinesweeperGame />)
  fireEvent.click(screen.getByRole("button", { name: /^行 1, 列 1,/ }))
  const board = screen.getByRole("group", { name: /9 × 9/ })
  const revealed = boardPosition(board)
  const scheduled = intervals.mock.calls.length
  act(() => vi.advanceTimersByTime(1999))
  language("en")
  expect(boardPosition(board)).toEqual(revealed)
  expect(intervals).toHaveBeenCalledTimes(scheduled)
  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByText("00:02")).toBeTruthy()
  language("th")
  expect(boardPosition(board)).toEqual(revealed)
})

it("keeps an unsaved tracker draft intact through language changes from another tab", () => {
  vi.useFakeTimers()
  mount(<AnimeTracker />)
  fireEvent.click(screen.getByRole("button", { name: translations.zh.addAnime }))
  fireEvent.change(screen.getByLabelText(/^标题/), { target: { value: "Draft language test" } })
  fireEvent.change(screen.getByLabelText(translations.zh.totalEpisodes), { target: { value: "24" } })
  fireEvent.change(screen.getByLabelText(translations.zh.currentEpisode), { target: { value: "7" } })
  fireEvent.change(screen.getByLabelText(translations.zh.notes), { target: { value: "中文 English ไทย" } })
  localStorage.setItem("xm-games-locale", "en")
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "xm-games-locale", newValue: "en", storageArea: localStorage })))
  expect(screen.getByLabelText(/^Title/)).toHaveProperty("value", "Draft language test")
  localStorage.setItem("xm-games-locale", "th")
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "xm-games-locale", newValue: "th", storageArea: localStorage })))
  expect(screen.getByLabelText(new RegExp(`^${translations.th.animeTitle}`))).toHaveProperty("value", "Draft language test")
  expect(screen.getByLabelText(translations.th.totalEpisodes)).toHaveProperty("value", "24")
  expect(screen.getByLabelText(translations.th.currentEpisode)).toHaveProperty("value", "7")
  expect(screen.getByLabelText(translations.th.notes)).toHaveProperty("value", "中文 English ไทย")
  expect(localStorage.getItem("xm-games-anime-tracker")).toBeNull()
})
