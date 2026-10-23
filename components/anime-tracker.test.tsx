// @vitest-environment jsdom

import type { ReactNode } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
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

beforeEach(() => {
  vi.useFakeTimers()
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
