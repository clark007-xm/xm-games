// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Game2048 } from "@/components/game-2048"
import { LocaleProvider, useLocale } from "./locale-context"
import { useHighScore } from "./use-high-score"

vi.mock("next/navigation", () => ({ usePathname: () => "/2048" }))
vi.mock("@/components/game-header", () => ({ GameHeader: () => null }))
vi.mock("@/components/game-rules-dialog", () => ({ GameRulesDialog: () => null }))

function LocaleProbe() {
  const { locale, setLocale } = useLocale()
  return <><output aria-label="locale">{locale}</output><button onClick={() => setLocale("en")}>English</button></>
}

function ScoreProbe({ name, score }: { name: string; score: number }) {
  const { highScore, storageUnavailable, recordScore } = useHighScore("2048-best")
  return <section aria-label={name}><output>{highScore}</output><button onClick={() => recordScore(score)}>Score</button>{storageUnavailable && <div role="alert">Unavailable</div>}</section>
}

function queueStorageLocks() {
  const operations: (() => void)[] = []
  const request = vi.fn((_name: string, operation: () => void) => new Promise<void>((resolve, reject) => {
    operations.push(() => { try { operation(); resolve() } catch (error) { reject(error) } })
  }))
  vi.stubGlobal("navigator", Object.create(navigator, { locks: { value: { request } } }))
  return { operations, request }
}

function storageChange(key: string | null, newValue: string | null) {
  if (key === null) localStorage.clear()
  else if (newValue === null) localStorage.removeItem(key)
  else localStorage.setItem(key, newValue)
  act(() => window.dispatchEvent(new StorageEvent("storage", { key, newValue, storageArea: localStorage })))
}

beforeEach(() => {
  vi.stubGlobal("navigator", Object.create(navigator, {
    locks: { value: { request: (_name: string, operation: () => void) => Promise.resolve(operation()) } },
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe("shared high scores", () => {
  it.each([true, false])("serializes competing scores with high scorer first: %s", async (higherFirst) => {
    const { operations, request } = queueStorageLocks()
    render(<><ScoreProbe name="higher" score={800} /><ScoreProbe name="lower" score={20} /></>)
    const names = higherFirst ? ["higher", "lower"] : ["lower", "higher"]
    for (const name of names) fireEvent.click(within(screen.getByRole("region", { name })).getByRole("button"))
    expect(request.mock.calls.map(call => call[0])).toEqual(["xm-games:2048-best", "xm-games:2048-best"])
    await act(async () => { operations.forEach(operation => operation()) })
    expect(localStorage.getItem("2048-best")).toBe("800")
  })

  it.each(["remove", "clear"])("cancels a queued old record after %s and permits a new score", async (operation) => {
    localStorage.setItem("2048-best", "400")
    const { operations } = queueStorageLocks()
    const view = render(<ScoreProbe name="score" score={800} />)
    fireEvent.click(screen.getByRole("button", { name: "Score" }))
    storageChange(operation === "remove" ? "2048-best" : null, null)
    await act(async () => { operations.shift()!() })
    expect(localStorage.getItem("2048-best")).toBeNull()
    expect(screen.getByRole("status").textContent).toBe("0")
    view.rerender(<ScoreProbe name="score" score={20} />)
    fireEvent.click(screen.getByRole("button", { name: "Score" }))
    await act(async () => { operations.shift()!() })
    expect(localStorage.getItem("2048-best")).toBe("20")
  })

  it.each([true, false])("finishes a queued score after leaving, unless storage was cleared: %s", async (cleared) => {
    const { operations } = queueStorageLocks()
    const view = render(<ScoreProbe name="score" score={800} />)
    const unsubscribe = vi.spyOn(window, "removeEventListener")
    fireEvent.click(screen.getByRole("button", { name: "Score" }))
    view.unmount()
    expect(unsubscribe.mock.calls.filter(call => call[0] === "storage")).toHaveLength(0)
    if (cleared) storageChange(null, null)
    await act(async () => { operations.shift()!() })
    expect(localStorage.getItem("2048-best")).toBe(cleared ? null : "800")
    expect(unsubscribe.mock.calls.filter(call => call[0] === "storage")).toHaveLength(1)
  })

  it("does not mistake the first pending save for a deletion when returning to the page", async () => {
    const { operations } = queueStorageLocks()
    render(<ScoreProbe name="score" score={800} />)
    fireEvent.click(screen.getByRole("button", { name: "Score" }))
    act(() => window.dispatchEvent(new Event("pageshow")))
    act(() => document.dispatchEvent(new Event("visibilitychange")))
    expect(screen.getByRole("status").textContent).toBe("800")
    await act(async () => { operations.shift()!() })
    expect(localStorage.getItem("2048-best")).toBe("800")
  })

  it("rehydrates after a reload and refreshes suspended tabs when they become visible", () => {
    localStorage.setItem("2048-best", "400")
    const first = render(<ScoreProbe name="score" score={800} />)
    expect(screen.getByRole("status").textContent).toBe("400")
    fireEvent.click(screen.getByRole("button", { name: "Score" }))
    first.unmount()
    render(<ScoreProbe name="score" score={20} />)
    expect(screen.getByRole("status").textContent).toBe("800")
    localStorage.setItem("2048-best", "1000")
    act(() => document.dispatchEvent(new Event("visibilitychange")))
    expect(screen.getByRole("status").textContent).toBe("1000")
  })

  it("keeps a failed save playable and retries the next earned score", () => {
    const save = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("Quota") })
    const view = render(<ScoreProbe name="score" score={20} />)
    fireEvent.click(screen.getByRole("button", { name: "Score" }))
    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getByRole("status").textContent).toBe("20")
    save.mockRestore()
    view.rerender(<ScoreProbe name="score" score={40} />)
    fireEvent.click(screen.getByRole("button", { name: "Score" }))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(localStorage.getItem("2048-best")).toBe("40")
  })

  it("does not replace another tab's higher score with a stale local score", () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    render(<LocaleProvider><Game2048 /></LocaleProvider>)
    localStorage.setItem("2048-best", "1000")
    fireEvent.keyDown(window, { key: "ArrowUp" })
    fireEvent.keyDown(window, { key: "ArrowLeft" })
    expect(localStorage.getItem("2048-best")).toBe("1000")
    expect(screen.getByRole("status").textContent).toBe("分数4最高分1000")
  })

  it("updates from another tab, while clear does not revive an old best", () => {
    render(<LocaleProvider><Game2048 /></LocaleProvider>)
    storageChange("2048-best", "800")
    expect(screen.getByRole("status").textContent).toBe("分数0最高分800")
    storageChange(null, null)
    expect(screen.getByRole("status").textContent).toBe("分数0最高分0")
    fireEvent.click(screen.getByRole("button", { name: "重新开始" }))
    expect(localStorage.getItem("2048-best")).toBeNull()
  })

  it.each(["120garbage", "-7", "Infinity", "3.5"])("ignores an invalid saved score: %s", (value) => {
    localStorage.setItem("2048-best", value)
    render(<LocaleProvider><Game2048 /></LocaleProvider>)
    expect(screen.getByRole("status").textContent).toBe("分数0最高分0")
  })
})

describe("shared language preference", () => {
  it("loads the saved language again after a reload", () => {
    const first = render(<LocaleProvider><LocaleProbe /></LocaleProvider>)
    fireEvent.click(screen.getByRole("button", { name: "English" }))
    first.unmount()
    render(<LocaleProvider><LocaleProbe /></LocaleProvider>)
    expect(screen.getByLabelText("locale").textContent).toBe("en")
    expect(localStorage.getItem("xm-games-locale")).toBe("en")
  })

  it("follows valid storage updates without writing them back", () => {
    render(<LocaleProvider><LocaleProbe /></LocaleProvider>)
    localStorage.setItem("xm-games-locale", "th")
    const write = vi.spyOn(Storage.prototype, "setItem")
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: "xm-games-locale", newValue: "th", storageArea: localStorage,
    })))
    expect(screen.getByLabelText("locale").textContent).toBe("th")
    expect(document.documentElement.lang).toBe("th")
    expect(write).not.toHaveBeenCalled()
    storageChange("xm-games-locale", "invalid")
    expect(screen.getByLabelText("locale").textContent).toBe("th")
  })

  it.each(["remove", "clear"])("returns to Chinese after an explicit %s", (operation) => {
    localStorage.setItem("xm-games-locale", "en")
    render(<LocaleProvider><LocaleProbe /></LocaleProvider>)
    expect(screen.getByLabelText("locale").textContent).toBe("en")
    storageChange(operation === "remove" ? "xm-games-locale" : null, null)
    expect(screen.getByLabelText("locale").textContent).toBe("zh")
    expect(localStorage.getItem("xm-games-locale")).toBeNull()
  })

  it("keeps language switching functional when reads and writes are blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
    render(<LocaleProvider><LocaleProbe /></LocaleProvider>)
    fireEvent.click(screen.getByRole("button", { name: "English" }))
    expect(screen.getByLabelText("locale").textContent).toBe("en")
  })
})
