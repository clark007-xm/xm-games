// @vitest-environment jsdom

import type { ReactNode } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { translations } from "@/lib/i18n"
import { AnimeTracker } from "./anime-tracker"

vi.mock("@/lib/locale-context", () => ({
  useLocale: () => ({ locale: "en", t: (key: keyof typeof translations.en) => translations.en[key] }),
}))
vi.mock("@/components/game-header", () => ({
  GameHeader: ({ actions }: { actions: ReactNode }) => <>{actions}</>,
}))

function anime(title: string, episodes: number | null = 12, score: number | null = 8.5, image = "") {
  return { mal_id: title.length, title, episodes, score, images: { jpg: { image_url: image, large_image_url: image } } }
}

type PendingSearch = {
  signal: AbortSignal
  resolve: (response: Response) => void
}
let requests: PendingSearch[]

const storageKey = "xm-games-anime-tracker"
const savedAnime = (id: string, currentEpisode = 0) => ({
  id, title: `Series ${id}`, totalEpisodes: 12, currentEpisode, status: "watching", type: "drama",
  rating: null, notes: "", imageUrl: "", addedAt: 1, updatedAt: 1,
})

function replaceStoredList(list: ReturnType<typeof savedAnime>[], notify = true) {
  const value = JSON.stringify(list)
  localStorage.setItem(storageKey, value)
  if (notify) act(() => { window.dispatchEvent(new StorageEvent("storage", { key: storageKey, newValue: value, storageArea: localStorage })) })
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(navigator, "locks", { configurable: true, value: {
    request: vi.fn((_name: string, callback: () => void) => {
      callback()
      return Promise.resolve()
    }),
  } })
  requests = []
  // Deliberately allow aborted requests to finish to exercise the response guard.
  vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise<Response>((resolve) => {
    requests.push({ signal: options.signal as AbortSignal, resolve })
  })))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, "locks")
  localStorage.clear()
})

function openTracker() {
  const view = render(<AnimeTracker />)
  fireEvent.click(screen.getByRole("button", { name: "Add Anime" }))
  return view
}

async function search(title: string) {
  fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: title } })
  await act(async () => { vi.advanceTimersByTime(500) })
}

async function respond(index: number, results: ReturnType<typeof anime>[]) {
  await act(async () => {
    requests[index].resolve({ ok: true, json: async () => ({ data: results }) } as Response)
  })
}

describe("anime search selection", () => {
  it("saves a form only once during a rapid submission burst and allows the next form", () => {
    openTracker()
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Burst series" } })
    const save = screen.getByRole("button", { name: "Save" })
    act(() => { for (let i = 0; i < 10; i++) save.click() })
    expect(JSON.parse(localStorage.getItem("xm-games-anime-tracker")!)).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Add Anime" }))
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Next series" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(JSON.parse(localStorage.getItem("xm-games-anime-tracker")!)).toHaveLength(2)
  })

  it("caps rapid episode increments at the total and never decrements below zero", () => {
    openTracker()
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Bounded series" } })
    fireEvent.change(screen.getByLabelText("Total Episodes"), { target: { value: "3" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    const increment = screen.getByRole("button", { name: `${translations.en.increaseEpisode}: Bounded series` })
    act(() => { for (let i = 0; i < 20; i++) increment.click() })
    expect(JSON.parse(localStorage.getItem("xm-games-anime-tracker")!)[0]).toMatchObject({ currentEpisode: 3, status: "completed" })
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^All/ }), { button: 0, ctrlKey: false })
    const decrement = screen.getByRole("button", { name: `${translations.en.decreaseEpisode}: Bounded series` })
    act(() => { for (let i = 0; i < 20; i++) decrement.click() })
    expect(JSON.parse(localStorage.getItem("xm-games-anime-tracker")!)[0]).toMatchObject({ currentEpisode: 0, status: "watching" })
  })

  it("clears missing fields and saves only the newly selected work's data", async () => {
    openTracker()
    await search("Finished")
    await respond(0, [anime("Finished series", 12, 8.5, "https://example.com/finished.jpg")])
    fireEvent.click(screen.getByRole("button", { name: /Finished series/ }))
    expect((screen.getByLabelText("Total Episodes") as HTMLInputElement).value).toBe("12")
    expect((screen.getByLabelText(/Rating/) as HTMLInputElement).value).toBe("8.5")

    await search("Ongoing")
    await respond(1, [anime("Ongoing series", null, null)])
    fireEvent.click(screen.getByRole("button", { name: /Ongoing series/ }))

    for (const label of ["Total Episodes", /Rating/, "Cover Image"]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe("")
    }
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(JSON.parse(localStorage.getItem("xm-games-anime-tracker")!)[0]).toMatchObject({
      title: "Ongoing series", totalEpisodes: null, rating: null, imageUrl: "",
    })
  })

  it("does not reopen the dropdown or refetch after selecting a result", async () => {
    openTracker()
    await search("Finished")
    await respond(0, [anime("Finished series")])
    fireEvent.click(screen.getByRole("button", { name: /Finished series/ }))
    await act(async () => { vi.advanceTimersByTime(1000) })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: /Finished series/ })).toBeNull()
  })
})

describe("anime saved data across page lifecycles", () => {
  it.each(["Current Episode", "Total Episodes"])("rejects unsafe integer values in %s before saving a record that cannot reload", (label) => {
    openTracker()
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Unsafe episode count" } })
    fireEvent.change(screen.getByLabelText(label), { target: { value: "100000000000000000000" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain(translations.en.animeFormError)
    expect(localStorage.getItem(storageKey)).toBeNull()
  })

  it("prevents episode increments from exceeding the largest safely stored integer", () => {
    const original = [{ ...savedAnime("A", Number.MAX_SAFE_INTEGER), totalEpisodes: null }]
    localStorage.setItem(storageKey, JSON.stringify(original))
    render(<AnimeTracker />)
    const increment = screen.getByRole("button", { name: `${translations.en.increaseEpisode}: Series A` }) as HTMLButtonElement
    expect(increment.disabled).toBe(true)
    fireEvent.click(increment)
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual(original)
  })

  it("loads saved entries without writing a snapshot back on mount", () => {
    replaceStoredList([savedAnime("A")], false)
    const write = vi.spyOn(Storage.prototype, "setItem")
    render(<AnimeTracker />)
    expect(screen.getByText("Series A")).toBeTruthy()
    expect(write).not.toHaveBeenCalled()
  })

  it("reflects another tab's changes and deletion without writing them back", () => {
    replaceStoredList([savedAnime("A")], false)
    render(<AnimeTracker />)
    replaceStoredList([savedAnime("B", 4)])
    expect(screen.queryByText("Series A")).toBeNull()
    expect(screen.getByText("Series B")).toBeTruthy()
    expect(screen.getByText("4 / 12")).toBeTruthy()
    replaceStoredList([])
    expect(screen.queryByText("Series B")).toBeNull()
  })

  it("merges an action against the latest stored records before the storage event arrives", () => {
    replaceStoredList([savedAnime("A")], false)
    render(<AnimeTracker />)
    replaceStoredList([savedAnime("A", 5), savedAnime("B")], false)
    fireEvent.click(screen.getByRole("button", { name: `${translations.en.increaseEpisode}: Series A` }))
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual([
      expect.objectContaining({ id: "A", currentEpisode: 6 }), savedAnime("B"),
    ])
  })

  it("adds a new record without resurrecting a record deleted in another tab", () => {
    replaceStoredList([savedAnime("A")], false)
    openTracker()
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "New series" } })
    replaceStoredList([savedAnime("B")], false)
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual([
      expect.objectContaining({ title: "New series" }), savedAnime("B"),
    ])
  })

  it("deletes only the selected record and keeps newly saved records from another tab", () => {
    replaceStoredList([savedAnime("A")], false)
    render(<AnimeTracker />)
    replaceStoredList([savedAnime("A", 5), savedAnime("B")], false)
    fireEvent.keyDown(screen.getByRole("button", { name: `${translations.en.animeActions}: Series A` }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }))
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual([savedAnime("B")])
  })

  it("does not replace damaged data introduced while this page is open", () => {
    replaceStoredList([savedAnime("A")], false)
    render(<AnimeTracker />)
    localStorage.setItem(storageKey, "{broken")
    fireEvent.click(screen.getByRole("button", { name: `${translations.en.increaseEpisode}: Series A` }))
    expect(localStorage.getItem(storageKey)).toBe("{broken")
    expect(screen.getByRole("alert").textContent).toContain(translations.en.storageReadError)
    fireEvent.click(screen.getByRole("button", { name: translations.en.retry }))
    expect(localStorage.getItem(storageKey)).toBe("{broken")
    replaceStoredList([savedAnime("A", 4), savedAnime("B")])
    fireEvent.click(screen.getByRole("button", { name: translations.en.retry }))
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual([
      expect.objectContaining({ id: "A", currentEpisode: 5 }), savedAnime("B"),
    ])
  })

  it.each([
    [savedAnime("A", -1)],
    [savedAnime("A", 13)],
    [savedAnime("A"), savedAnime("A")],
  ])("preserves invalid saved record data rather than enabling writes", (...records) => {
    const original = JSON.stringify(records)
    localStorage.setItem(storageKey, original)
    openTracker()
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "New record" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByRole("alert").textContent).toContain(translations.en.storageReadError)
    expect(localStorage.getItem(storageKey)).toBe(original)
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("serializes concurrent actions from two open trackers using the latest data", async () => {
    // Model the actual asynchronous exclusive lock queue rather than a sync mock.
    let tail = Promise.resolve()
    vi.mocked(navigator.locks.request).mockImplementation((_name: string, callback: unknown) => {
      const next = tail.then(() => (callback as () => void)())
      tail = next.catch(() => {})
      return next
    })
    replaceStoredList([savedAnime("A")], false)
    const left = render(<AnimeTracker />)
    const right = render(<AnimeTracker />)
    const increment = `${translations.en.increaseEpisode}: Series A`
    act(() => {
      for (let i = 0; i < 4; i++) {
        within(left.container).getByRole("button", { name: increment }).click()
        within(right.container).getByRole("button", { name: increment }).click()
      }
    })
    await act(async () => { await tail })
    expect(JSON.parse(localStorage.getItem(storageKey)!)[0].currentEpisode).toBe(8)
    expect(navigator.locks.request).toHaveBeenCalledTimes(8)
  })

  it("preserves a failed episode delta and rebases retry on another tab's changes", () => {
    replaceStoredList([savedAnime("A")], false)
    render(<AnimeTracker />)
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota") })
    fireEvent.click(screen.getByRole("button", { name: `${translations.en.increaseEpisode}: Series A` }))
    expect(screen.getByRole("alert").textContent).toContain(translations.en.storageWriteError)
    write.mockRestore()
    replaceStoredList([savedAnime("A", 5), savedAnime("B")])
    fireEvent.click(screen.getByRole("button", { name: translations.en.retry }))
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual([
      expect.objectContaining({ id: "A", currentEpisode: 6 }), savedAnime("B"),
    ])
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("retains the form after a failed save and retries with its latest draft", () => {
    openTracker()
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Original draft" } })
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota") })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain(translations.en.storageWriteError)
    write.mockRestore()
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Revised draft" } })
    replaceStoredList([savedAnime("B")])
    fireEvent.click(screen.getByRole("button", { name: translations.en.retry }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual([
      expect.objectContaining({ title: "Revised draft" }), savedAnime("B"),
    ])
  })

  it("keeps a submitted form stable while its asynchronous storage lock is pending", async () => {
    let release!: () => void
    vi.mocked(navigator.locks.request).mockImplementation((_name: string, callback: unknown) => new Promise<void>(resolve => {
      release = () => { (callback as () => void)(); resolve() }
    }))
    openTracker()
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Pending save" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByLabelText(/^Title/).closest("fieldset")?.disabled).toBe(true)
    const refresh = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(refresh)
    expect(refresh.defaultPrevented).toBe(true)
    await act(async () => { release() })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(JSON.parse(localStorage.getItem(storageKey)!)[0].title).toBe("Pending save")
  })

  it("keeps the draft and original records when both safe storage lock mechanisms are unavailable", async () => {
    Reflect.deleteProperty(navigator, "locks")
    replaceStoredList([savedAnime("A")], false)
    openTracker()
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Unavailable storage" } })
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })) })
    expect(screen.getByRole("alert").textContent).toContain(translations.en.storageWriteError)
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe("Unavailable storage")
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual([savedAnime("A")])
  })

  it.each(["changed", "deleted"])("preserves an edit draft when its record was %s in another tab", (change) => {
    replaceStoredList([savedAnime("A")], false)
    render(<AnimeTracker />)
    fireEvent.keyDown(screen.getByRole("button", { name: `${translations.en.animeActions}: Series A` }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }))
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "My edit draft" } })
    const latest = change === "changed" ? [savedAnime("A", 6)] : []
    replaceStoredList(latest, false)
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain(translations.en.animeEditConflict)
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe("My edit draft")
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual(latest)
  })

  it("refreshes on returning to the visible page and removes lifecycle listeners on unmount", () => {
    replaceStoredList([savedAnime("A")], false)
    const removeWindow = vi.spyOn(window, "removeEventListener")
    const removeDocument = vi.spyOn(document, "removeEventListener")
    const { unmount } = render(<AnimeTracker />)
    replaceStoredList([savedAnime("A", 9)], false)
    act(() => { document.dispatchEvent(new Event("visibilitychange")) })
    expect(screen.getByText("9 / 12")).toBeTruthy()
    unmount()
    expect(removeWindow).toHaveBeenCalledWith("storage", expect.any(Function))
    expect(removeWindow).toHaveBeenCalledWith("pageshow", expect.any(Function))
    expect(removeDocument).toHaveBeenCalledWith("visibilitychange", expect.any(Function))
  })

  it("warns about a refresh with a draft, then reloads only explicitly saved entries", () => {
    const { unmount } = openTracker()
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Unsaved draft" } })
    const refresh = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(refresh)
    expect(refresh.defaultPrevented).toBe(true)
    expect(localStorage.getItem(storageKey)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    const savedRefresh = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(savedRefresh)
    expect(savedRefresh.defaultPrevented).toBe(false)
    unmount()
    render(<AnimeTracker />)
    expect(screen.getByText("Unsaved draft")).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("anime search request lifecycle", () => {
  it("times out a stalled request, ignores its late reply, and can retry", async () => {
    openTracker()
    await search("Timeout")
    await act(async () => { vi.advanceTimersByTime(10_000) })
    expect(requests[0].signal.aborted).toBe(true)
    expect(screen.getByRole("alert").textContent).toContain(translations.en.animeSearchError)
    expect(document.querySelector(".animate-spin")).toBeNull()
    await respond(0, [anime("Late result")])
    expect(screen.queryByRole("button", { name: /Late result/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: translations.en.retry }))
    await act(async () => { vi.advanceTimersByTime(500) })
    await respond(1, [anime("Recovered result")])
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByRole("button", { name: /Recovered result/ })).toBeTruthy()
  })

  it("keeps results available while tabbing into them and supports click activation without mouseDown", async () => {
    openTracker()
    await search("Keyboard")
    await respond(0, [anime("Keyboard result")])
    const result = screen.getByRole("button", { name: /Keyboard result/ })
    fireEvent.blur(screen.getByLabelText(/^Title/), { relatedTarget: result })
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(screen.getByRole("button", { name: /Keyboard result/ })).toBeTruthy()
    fireEvent.click(result)
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe("Keyboard result")
    expect((screen.getByLabelText("Total Episodes") as HTMLInputElement).value).toBe("12")
  })

  it("ignores an older response that arrives after the new results", async () => {
    openTracker()
    await search("Older")
    await search("Newer")
    expect(requests[0].signal.aborted).toBe(true)
    await respond(1, [anime("Newer result")])
    await respond(0, [anime("Older result")])

    expect(screen.getByRole("button", { name: /Newer result/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Older result/ })).toBeNull()
  })

  it("does not stop the new loading indicator when an older request finishes", async () => {
    const { container } = openTracker()
    await search("Older")
    await search("Newer")
    await respond(0, [anime("Older result")])
    // The dialog is portaled outside the render container.
    expect(container.ownerDocument.querySelector(".animate-spin")).not.toBeNull()
    expect(screen.queryByRole("button", { name: /Older result/ })).toBeNull()
    await respond(1, [anime("Newer result")])
    expect(container.ownerDocument.querySelector(".animate-spin")).toBeNull()
  })

  it("invalidates results immediately when the title is cleared", async () => {
    openTracker()
    await search("Older")
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "" } })
    expect(requests[0].signal.aborted).toBe(true)
    await respond(0, [anime("Older result")])
    expect(screen.queryByRole("button", { name: /Older result/ })).toBeNull()
  })

  it("does not restore results after closing and reopening the dialog", async () => {
    openTracker()
    await search("Older")
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(requests[0].signal.aborted).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Add Anime" }))
    await respond(0, [anime("Older result")])

    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe("")
    expect(screen.queryByRole("button", { name: /Older result/ })).toBeNull()
  })

  it("aborts the current request on unmount", async () => {
    const { unmount } = openTracker()
    await search("Older")
    unmount()
    expect(requests[0].signal.aborted).toBe(true)
    await respond(0, [anime("Older result")])
  })
})
