// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { translations } from "@/lib/i18n"
import { BingoCards } from "./bingo-cards"

vi.mock("@/lib/locale-context", () => ({
  useLocale: () => ({ locale: "en", t: (key: keyof typeof translations.en) => translations.en[key] }),
}))
vi.mock("@/components/game-header", () => ({ GameHeader: () => null }))

let queue: string[]
const cancel = vi.fn(() => { queue = [] })
const speak = vi.fn((utterance: SpeechSynthesisUtterance) => { queue.push(utterance.text) })

beforeEach(() => {
  queue = []
  vi.stubGlobal("speechSynthesis", { cancel, speak })
  vi.stubGlobal("SpeechSynthesisUtterance", class {
    constructor(public text: string) {}
  })
  // Both generated cards have the same first row: 1, 16, 31, 46, 61.
  vi.spyOn(Math, "random").mockReturnValue(0)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe("speech session lifecycle", () => {
  function setupRecognition() {
    vi.useFakeTimers()
    const recognizers: FakeRecognition[] = []
    class FakeRecognition {
      onresult: ((event: SpeechRecognitionEvent) => void) | null = null
      onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null
      onstart: (() => void) | null = null
      onend: (() => void) | null = null
      busy = false
      start = vi.fn(() => {
        if (this.busy) throw new DOMException("Already started", "InvalidStateError")
        this.busy = true
      })
      abort = vi.fn()
      constructor() { recognizers.push(this) }
      end() { this.busy = false; this.onend?.() }
    }
    vi.stubGlobal("SpeechRecognition", FakeRecognition)
    const view = render(<BingoCards />)
    const recognition = recognizers[0]
    fireEvent.click(screen.getByRole("button", { name: translations.en.addCard }))
    fireEvent.click(screen.getByRole("button", { name: translations.en.startListening }))
    act(() => recognition.onstart?.())
    const result = { resultIndex: 0, results: [{ 0: { transcript: "1 16 31 46 61" }, isFinal: true }] } as unknown as SpeechRecognitionEvent
    return { recognition, result, ...view }
  }

  it.each(["stop", "reset"])("ignores late speech results after %s", action => {
    const { recognition, result } = setupRecognition()
    const lateResult = recognition.onresult!
    fireEvent.click(screen.getByRole("button", { name: action === "stop" ? translations.en.stopListening : translations.en.resetMarks }))
    act(() => {
      lateResult(result)
      recognition.onerror?.({ error: "network" } as SpeechRecognitionErrorEvent)
      recognition.end()
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByText("BINGO!")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(recognition.start).toHaveBeenCalledTimes(1)
    expect(queue).toEqual([])
  })

  it("waits for abort to finish before a rapid restart, and cleans up on unmount", () => {
    const { recognition, result, unmount } = setupRecognition()
    const lateResult = recognition.onresult!
    fireEvent.click(screen.getByRole("button", { name: translations.en.stopListening }))
    fireEvent.click(screen.getByRole("button", { name: translations.en.startListening }))
    act(() => { lateResult(result); recognition.onerror?.({ error: "aborted" } as SpeechRecognitionErrorEvent) })
    expect(screen.queryByText("BINGO!")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(recognition.start).toHaveBeenCalledTimes(1)
    act(() => { recognition.end(); vi.advanceTimersByTime(150); recognition.onstart?.(); recognition.onresult?.(result) })
    expect(recognition.start).toHaveBeenCalledTimes(2)
    expect(screen.getByText("BINGO!")).toBeTruthy()
    act(() => recognition.end())
    unmount()
    act(() => { lateResult(result); vi.advanceTimersByTime(1000) })
    expect(recognition.start).toHaveBeenCalledTimes(2)
    expect(recognition.onresult).toBeNull()
    expect(queue).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})

function mark(number: number) {
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: String(number) } })
  fireEvent.click(screen.getByRole("button", { name: translations.en.confirm }))
}

function markWinningRow() {
  for (const number of [1, 16, 31, 46, 61]) mark(number)
}

describe("Bingo winner announcements", () => {
  it("does not reuse a card name after deleting an earlier card", () => {
    render(<BingoCards />)
    fireEvent.click(screen.getByRole("button", { name: translations.en.addCard }))
    fireEvent.click(screen.getByRole("button", { name: translations.en.addCard }))
    fireEvent.click(screen.getByRole("button", { name: "Delete Card 1" }))
    fireEvent.click(screen.getByRole("button", { name: translations.en.addCard }))
    expect(screen.getAllByRole("group", { name: "Card 2" })).toHaveLength(1)
    expect(screen.getByRole("group", { name: "Card 3" })).toBeTruthy()
    markWinningRow()
    expect(queue).toEqual(["Card 2 Bingo!", "Card 3 Bingo!"])
    fireEvent.click(screen.getByRole("button", { name: translations.en.resetMarks }))
    expect(screen.getByRole("group", { name: "Card 3" })).toBeTruthy()
    expect(screen.queryByText("BINGO!")).toBeNull()
  })

  it("queues every simultaneous winner once and clears pending speech on reset", () => {
    render(<BingoCards />)
    fireEvent.click(screen.getByRole("button", { name: translations.en.addCard }))
    fireEvent.click(screen.getByRole("button", { name: translations.en.addCard }))
    markWinningRow()

    expect(screen.getAllByText("BINGO!")).toHaveLength(2)
    expect(queue).toEqual(["Card 1 Bingo!", "Card 2 Bingo!"])
    expect(speak).toHaveBeenCalledTimes(2)
    mark(2)
    expect(speak).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole("button", { name: translations.en.resetMarks }))
    expect(queue).toEqual([])
    markWinningRow()
    expect(queue).toEqual(["Card 1 Bingo!", "Card 2 Bingo!"])
    expect(speak).toHaveBeenCalledTimes(4)
  })

  it("cancels queued speech when leaving the page", () => {
    const { unmount } = render(<BingoCards />)
    fireEvent.click(screen.getByRole("button", { name: translations.en.addCard }))
    markWinningRow()
    expect(queue).toHaveLength(1)
    unmount()
    expect(queue).toEqual([])
  })
})
